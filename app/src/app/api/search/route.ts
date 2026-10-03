import { NextResponse } from "next/server";

import { normalizePage } from "@/components/article-list";
import { buildHighlights, stripHtml, type SearchHighlights } from "@/components/search-highlight";
import { prisma } from "@/lib/prisma";

/**
 * 全站搜索（T2.7）—— `GET /api/search`（docs/14 §5.16 / A25）
 * ============================================================================
 * 入参：`site`（必填）、`q`（必填，1~50 字）、`channel?`、`page?`、`pageSize?`
 * 返回：`Ok<Paginated<SearchHit>>`（信封与分页字段见 docs/14 §2.1）
 *
 * · 检索：Prisma `contains` 命中 `title` + `content`（**运行时检索**，不做全文索引/A25 明确不做）
 * · **高亮片段由服务端生成**：`buildHighlights()` 先转义、后插 `<mark>` ⇒ 返回体里**没有原始 HTML**
 * · 过滤口径与前台一致：`published` + `deletedAt=null` + 定时发布（C5 三条件）
 * · 页面侧**自调本端点**（`search/page.tsx`）⇒ 页面与外部消费者共用同一实现（单一数据源）
 *
 * 约定：`VALIDATION_FAILED` → 400、`NOT_FOUND` → 404（docs/14 §2.2）。
 */

// 搜索是请求级结果：不做 ISR（docs/15 §6：`revalidate: 0`）
export const revalidate = 0;

const MAX_QUERY_LENGTH = 50;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

type SearchHit = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  highlights: SearchHighlights;
  channel: { name: string; nameEn: string | null; slug: string } | null;
  publishTime: Date | null;
};

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const siteSlug = searchParams.get("site")?.trim() ?? "";
  const query = searchParams.get("q")?.trim() ?? "";
  const channelSlug = searchParams.get("channel")?.trim() || undefined;
  const rawPageSize = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.isFinite(rawPageSize) ? rawPageSize : DEFAULT_PAGE_SIZE),
  );

  if (!siteSlug) {
    return fail(404, "NOT_FOUND", "站点不存在");
  }
  if (!query) {
    return fail(400, "VALIDATION_FAILED", "请输入关键词");
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return fail(400, "VALIDATION_FAILED", `关键词最多 ${MAX_QUERY_LENGTH} 个字符`);
  }

  const site = await prisma.site.findUnique({
    where: { slug: siteSlug },
    select: { id: true, status: true },
  });
  if (!site || !site.status) {
    return fail(404, "NOT_FOUND", "站点不存在");
  }

  const now = new Date();
  const where = {
    siteId: site.id,
    status: "published",
    deletedAt: null,
    ...(channelSlug ? { channel: { slug: channelSlug } } : {}),
    AND: [
      { OR: [{ publishTime: null }, { publishTime: { lte: now } }] },
      { OR: [{ title: { contains: query } }, { content: { contains: query } }] },
    ],
  };

  const total = await prisma.article.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // 复用列表页的页码收敛（唯一实现）；非法/越界一律夹到 1..totalPages
  const page = normalizePage(searchParams.get("page") ?? undefined, totalPages);

  const rows = await prisma.article.findMany({
    where,
    orderBy: [{ top: "desc" }, { publishTime: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      content: true,
      publishTime: true,
      channel: { select: { name: true, nameEn: true, slug: true } },
    },
  });

  const items: SearchHit[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    highlights: {
      title: buildHighlights(row.title, query, { max: 1, radius: 20 }),
      // 正文先投影成纯文本再取片段（结果仍会被转义，见 search-highlight.tsx）
      content: buildHighlights(stripHtml(row.content), query, { max: 2, radius: 40 }),
    },
    channel: row.channel,
    publishTime: row.publishTime,
  }));

  return NextResponse.json({
    ok: true,
    data: {
      items,
      page,
      pageSize,
      total,
      totalPages,
      hasNext: page < totalPages,
    },
  });
}
