import { NextResponse } from "next/server";

import { parsePositiveInt } from "@/lib/actions-shared";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/comments?articleId=&page=&pageSize=`（M5-4b / `docs/14` §5.4 **L413**）
 * ============================================================================
 * **公开端点**：只返回 `status='approved' AND deletedAt IS NULL` 的评论，**顶级评论 + 各自 `replies[]`**。
 *
 * · **无鉴权**：本端点不需要 L1/L2（`proxy.ts` 的 matcher 排除 `api`，该文件 L56 亦注明
 *   "api → Route Handler 自行鉴权"；此处是**有意公开**的读接口，故不做任何会话检查）。
 * · **分页单位 = 顶级评论**（`parentId: null`）—— 依据契约"返回顶级评论 + 各自 `replies[]`"：
 *   若按"全部行"分页会把父评论与其回复**拆到不同页**，`replies[]` 将失去父。
 *   ⚠ 与**后台** `admin/comments/actions.ts` 的 `listComments` **刻意不同**（后台为"审核不漏"
 *   采用平铺、`status` 覆盖所有层级）；两者语义不同，故**不复用后台 Action**：
 *   后台 Action 带 **L1 + L2 `comment.manage`** 鉴权，且返回含 `email`/`ip`/`status` 的管理字段。
 * · **字段裁剪**：只出 `id / name / content / createdAt`（+ 回复同形）—— **不下发 `email`、
 *   `ip`、`status`**（公开端点不泄露隐私与审核态；契约未列字段，属合理收口）。
 * · **文章不存在 / 无已通过评论** ⇒ 返回**空列表**（`total: 0`）而**非 404**：对外表现与"该文章
 *   0 条评论"一致，也避免用 404 探测文章是否存在（`docs/14` §8 A7 的"404 防探测"针对 `site` slug 场景）。
 * · 错误信封照唯一既有公开端点 `api/search/route.ts` **L38-L39** 的本地 `fail()`（两行）；
 *   成功形状照其 **L119-L129**（`{ ok: true, data: { items, page, pageSize, total, totalPages, hasNext } }`）。
 *   📌 M6 小清理（已登记）：`fail()` 已有 3 份同形实现（search / `lib/excel.ts` / 本文件），
 *   建议抽 `lib/api-response.ts` 统一。
 */

/** 失败响应（`docs/14` §2.1 信封；照 `api/search/route.ts` L38-L39） */
function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const articleId = (searchParams.get("articleId") ?? "").trim();

  if (!articleId) {
    return fail(400, "VALIDATION_FAILED", "缺少 articleId。");
  }

  const page = parsePositiveInt(searchParams.get("page") ?? undefined, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 1,
  });
  const pageSize = parsePositiveInt(searchParams.get("pageSize") ?? undefined, {
    min: 1,
    max: 100,
    fallback: 20,
  });

  // 公开可见性口径：已通过 + 未软删除
  const visible = { articleId, status: "approved", deletedAt: null };
  const topLevel = { ...visible, parentId: null };

  const [rows, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where: topLevel,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        content: true,
        createdAt: true,
        // 回复同样只取"已通过 + 未删"，并按对话顺序升序
        replies: {
          where: { status: "approved", deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, content: true, createdAt: true },
        },
      },
    }),
    prisma.comment.count({ where: topLevel }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      items: rows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: page * pageSize < total,
    },
  });
}
