import * as ExcelJS from "exceljs";

import { requireSession } from "@/lib/actions-shared";
import { dateKeyOf, formatTableDate } from "@/lib/date";
import { containsCI } from "@/lib/db-search";
import { MAX_EXPORT_ROWS, buildXlsxResponse, failResponse } from "@/lib/excel";
import { can, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isArticleStatus } from "@/lib/state-machine";

/**
 * `GET /api/export/articles?site=&status=&channel=&keyword=`（M5-5b / `docs/14` §6.2 **L628** + L632）
 * ============================================================================
 * · **鉴权自带两层**（`proxy.ts` 的 matcher 排除 `api`，见该文件 L56 注释）：
 *   L1 `requireSession()` → L2 `can(role, "article.read")`（`docs/14` L628 的权限列）
 * · **筛选口径与 `listArticles` 完全一致**（`admin/articles/actions.ts` L224-L233）：
 *   `deletedAt: null` + 可选 `siteId` / `channelId` / `status`（非法值忽略而非报错）/
 *   `keyword`（`title` 或 `summary` 的 `contains`）；**不带分页**（导出全量）
 * · **数据范围**：`super_admin` 可用 `?site=`（**slug 或 id**）收窄，缺省 = 全站；
 *   其余角色**忽略入参、强制锁 `session.siteId`**（与 `listArticles` 的 `scopeSiteIdOf` 同口径）
 * · **行数上限**：`docs/14` L632 —— 单次 ≤ **10000 行**，超出 → **`VALIDATION_FAILED`(400)**；
 *   实现为**先 `count` 再 `findMany`**（避免先拉十万行进内存）
 * · **列**：标题 / 栏目 / 状态 / 作者 / 发布时间 / 浏览量 / 更新时间（中文表头）；
 *   日期走 `lib/date.ts` 的 `formatTableDate`（**Asia/Shanghai**，`docs/14` L632 + A32）
 */

/** 六态中文（`docs/13` §7.1；后台统一硬编码中文，T3.2 裁决 6） */
const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_first: "待初审",
  pending_final: "待终审",
  published: "已发布",
  rejected: "已退回",
  withdrawn: "已撤稿",
};

/** `Fail.code` → HTTP 状态（与 `api/search/route.ts` L38 的私有实现同口径） */
function statusOfCode(code: string): number {
  if (code === "UNAUTHORIZED") {
    return 401;
  }
  if (code === "FORBIDDEN") {
    return 403;
  }
  if (code === "NOT_FOUND") {
    return 404;
  }
  return 400;
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const rawSite = (searchParams.get("site") ?? "").trim();
  const rawStatus = (searchParams.get("status") ?? "").trim();
  const channelId = (searchParams.get("channel") ?? "").trim() || undefined;
  const keyword = (searchParams.get("keyword") ?? "").trim() || undefined;

  // L1
  const scope = await requireSession();
  if (!scope.ok) {
    return failResponse(statusOfCode(scope.fail.code), scope.fail);
  }
  const { session } = scope;

  // L2（docs/14 L628）
  if (!can(session.role, "article.read")) {
    return failResponse(403, { code: "FORBIDDEN", message: "无权导出文章。" });
  }

  // 数据范围：super_admin 可用 ?site=（slug 或 id）收窄；其余角色锁本站
  let siteId: string | null = null;
  if (isSuperAdmin(session.role)) {
    if (rawSite) {
      const site = await prisma.site.findFirst({
        where: { OR: [{ slug: rawSite }, { id: rawSite }] },
        select: { id: true },
      });
      if (!site) {
        return failResponse(404, { code: "NOT_FOUND", message: "站点不存在。" });
      }
      siteId = site.id;
    }
  } else {
    siteId = session.siteId;
  }

  const status = rawStatus && isArticleStatus(rawStatus) ? rawStatus : undefined;

  const where = {
    deletedAt: null,
    ...(siteId ? { siteId } : {}),
    ...(channelId ? { channelId } : {}),
    ...(status ? { status } : {}),
    ...(keyword
      ? {
          OR: [{ title: containsCI(keyword) }, { summary: containsCI(keyword) }],
        }
      : {}),
  };

  // 先 count：超限直接 400，不把数据拉进内存（docs/14 L632）
  const total = await prisma.article.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    return failResponse(400, {
      code: "VALIDATION_FAILED",
      message: `导出上限 ${MAX_EXPORT_ROWS} 行（当前 ${total} 行），请收窄筛选。`,
    });
  }

  const rows = await prisma.article.findMany({
    where,
    orderBy: { publishTime: "desc" },
    select: {
      title: true,
      status: true,
      author: true,
      publishTime: true,
      viewCount: true,
      updatedAt: true,
      channel: { select: { name: true } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XX大学站群系统";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("文章列表");
  sheet.columns = [
    { header: "标题", key: "title", width: 46 },
    { header: "栏目", key: "channel", width: 16 },
    { header: "状态", key: "status", width: 10 },
    { header: "作者", key: "author", width: 16 },
    { header: "发布时间", key: "publishTime", width: 20 },
    { header: "浏览量", key: "viewCount", width: 10 },
    { header: "更新时间", key: "updatedAt", width: 20 },
  ];

  for (const row of rows) {
    sheet.addRow({
      title: row.title,
      channel: row.channel.name,
      status: STATUS_LABELS[row.status] ?? row.status,
      author: row.author ?? "",
      publishTime: formatTableDate(row.publishTime),
      viewCount: row.viewCount,
      updatedAt: formatTableDate(row.updatedAt),
    });
  }

  // 文件名日期按 Asia/Shanghai（dateKeyOf 是 docs/13 §5.3 的唯一实现，lib/date.ts L57）
  const dateKey = dateKeyOf(new Date()).replaceAll("-", "");
  return buildXlsxResponse({
    workbook,
    filename: `文章列表-${dateKey}.xlsx`,
    asciiFilename: `articles-${dateKey}.xlsx`,
  });
}
