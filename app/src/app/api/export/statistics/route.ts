import * as ExcelJS from "exceljs";

import { requireSession, parsePositiveInt } from "@/lib/actions-shared";
import { dateKeyOf } from "@/lib/date";
import { MAX_EXPORT_ROWS, buildXlsxResponse, failResponse } from "@/lib/excel";
import { can, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

import {
  getArticleRanking,
  getChannelRanking,
  getSourceBreakdown,
} from "@/app/admin/statistics/actions";

/**
 * `GET /api/export/statistics?site=&days=`（M5-5b / `docs/14` §6.2 **L630** + L632）
 * ============================================================================
 * · **鉴权自带两层**（`proxy.ts` matcher 排除 `api`）：L1 `requireSession()` →
 *   L2 `can(role, "statistics.read")`（`docs/14` L630 的权限列）
 * · **数据范围**：`super_admin` 可用 `?site=`（slug 或 id）收窄，缺省 = 全站；
 *   其余角色**忽略入参、强制锁本站**（与 M5-3 的 `resolveScope` 同口径）
 * · **3 个 worksheet**（M5-5b 裁决）：
 *     ① `趋势` —— 日期 / PV / UV / IP（`?days=` 生效，默认 90）
 *     ② `来源` —— 来源（中文）/ PV
 *     ③ `排行` —— 两段：文章排行（标题 / 浏览量）+ 栏目排行（栏目 / 文章数 / 总浏览量）
 * · ⚠ **趋势数据未用 `getVisitTrend()`**：该 Action **无入参**（`dashboard/actions.ts`
 *   L130-L152：固定 session 范围 + 固定 90 天 `slice`），**无法兑现 `docs/14` L630 的
 *   `?site=&days=`** ⇒ 本端点按同一聚合口径（`Statistic` 按 `dateKey` 求和、取最近 N 天，
 *   docs/13 Q6 方案 A）**在此本地查询**，以兑现契约参数。若日后把 `getVisitTrend` 扩成
 *   `({ siteId?, days? })`，可改回调用它（本文件注释留痕）。
 *   来源 / 文章排行 / 栏目排行则**直接复用 M5-3 的 3 个 Action**（`admin/statistics/actions.ts`）。
 * · 行数上限：合计 > `MAX_EXPORT_ROWS` → `VALIDATION_FAILED`(400)（`docs/14` L632；
 *   实际规模为 days + 3 + 10 + 10，基本不会触发）
 */

/** `Statistic.source` → 中文（`docs/13` 三值枚举 + `null` 归 `direct`，与 M5-3 同口径） */
const SOURCE_LABELS: Record<string, string> = {
  search: "搜索",
  direct: "直接访问",
  external: "外部链接",
};

/** `Fail.code` → HTTP 状态 */
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
  const days = parsePositiveInt(searchParams.get("days") ?? undefined, {
    min: 1,
    max: 365,
    fallback: 90,
  });

  // L1
  const scope = await requireSession();
  if (!scope.ok) {
    return failResponse(statusOfCode(scope.fail.code), scope.fail);
  }
  const { session } = scope;

  // L2（docs/14 L630）
  if (!can(session.role, "statistics.read")) {
    return failResponse(403, { code: "FORBIDDEN", message: "无权导出统计报表。" });
  }

  // 数据范围
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

  // 趋势：本地聚合（见文件头 ⚠ 说明）——与 getVisitTrend 同口径：按 dateKey 求和、取最近 N 天
  const grouped = await prisma.statistic.groupBy({
    by: ["dateKey"],
    _sum: { pv: true, uv: true, ip: true },
    where: siteId ? { siteId } : {},
    orderBy: { dateKey: "asc" },
  });
  const trend = grouped.slice(-days).map((row) => ({
    dateKey: row.dateKey,
    pv: row._sum.pv ?? 0,
    uv: row._sum.uv ?? 0,
    ip: row._sum.ip ?? 0,
  }));

  const [sourceResult, articleRankResult, channelRankResult] = await Promise.all([
    getSourceBreakdown({ siteId: siteId ?? undefined, days }),
    getArticleRanking({ siteId: siteId ?? undefined }),
    getChannelRanking({ siteId: siteId ?? undefined }),
  ]);

  // 逐个小提前返回（`for` 循环里 TS 无法跨迭代收窄 `Ok | Fail` 联合类型）
  if (!sourceResult.ok) {
    return failResponse(statusOfCode(sourceResult.code), sourceResult);
  }
  if (!articleRankResult.ok) {
    return failResponse(statusOfCode(articleRankResult.code), articleRankResult);
  }
  if (!channelRankResult.ok) {
    return failResponse(statusOfCode(channelRankResult.code), channelRankResult);
  }

  const sources = sourceResult.data;
  const articleRanking = articleRankResult.data;
  const channelRanking = channelRankResult.data;

  const rowCount = trend.length + sources.length + articleRanking.length + channelRanking.length;
  if (rowCount > MAX_EXPORT_ROWS) {
    return failResponse(400, {
      code: "VALIDATION_FAILED",
      message: `导出上限 ${MAX_EXPORT_ROWS} 行（当前 ${rowCount} 行），请收窄天数或筛选。`,
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XX大学站群系统";
  workbook.created = new Date();

  // ① 趋势
  const trendSheet = workbook.addWorksheet("趋势");
  trendSheet.columns = [
    { header: "日期", key: "dateKey", width: 14 },
    { header: "PV", key: "pv", width: 12 },
    { header: "UV", key: "uv", width: 12 },
    { header: "IP", key: "ip", width: 12 },
  ];
  for (const point of trend) {
    trendSheet.addRow(point);
  }

  // ② 来源
  const sourceSheet = workbook.addWorksheet("来源");
  sourceSheet.columns = [
    { header: "来源", key: "source", width: 16 },
    { header: "PV", key: "pv", width: 12 },
  ];
  for (const item of sources) {
    sourceSheet.addRow({ source: SOURCE_LABELS[item.source] ?? item.source, pv: item.pv });
  }

  // ③ 排行（两段：文章 + 栏目）
  const rankSheet = workbook.addWorksheet("排行");
  rankSheet.columns = [
    { key: "a", width: 46 },
    { key: "b", width: 16 },
    { key: "c", width: 16 },
  ];
  rankSheet.addRow(["文章排行（按浏览量倒序 · 已发布）"]);
  rankSheet.addRow(["标题", "浏览量"]);
  for (const row of articleRanking) {
    rankSheet.addRow([row.title, row.viewCount]);
  }
  rankSheet.addRow([]);
  rankSheet.addRow(["栏目排行（按已发布文章数 · 含总浏览量）"]);
  rankSheet.addRow(["栏目", "文章数", "总浏览量"]);
  for (const row of channelRanking) {
    rankSheet.addRow([row.name, row.count, row.totalViews]);
  }

  // 文件名日期按 Asia/Shanghai
  const dateKey = dateKeyOf(new Date()).replaceAll("-", "");
  return buildXlsxResponse({
    workbook,
    filename: `统计报表-${dateKey}.xlsx`,
    asciiFilename: `statistics-${dateKey}.xlsx`,
  });
}
