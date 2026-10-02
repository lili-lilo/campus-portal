import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { ArticleCard, type ArticleItem } from "@/components/article-card";
import { prisma } from "@/lib/prisma";

/**
 * 列表页通用文章列表（T2.4）+ 列表页共用的**分页查询**
 * ============================================================================
 * 本文件同时承载两件事（刻意为之，受"本轮只允许 9 个文件"约束）：
 *   1. `ArticleList` —— 纯展示列表（复用 T2.2 的 `ArticleCard variant="compact"`）
 *   2. `fetchChannelArticles` / `normalizePage` —— 7 个列表页共用的**同一份**查询与分页收敛逻辑
 *
 * ⚠ **后续移动建议**：数据层更适合放 `src/lib/articles.ts`；等文件范围放开时把
 *   `fetchChannelArticles` / `normalizePage` / `PAGE_SIZE` 整体挪过去即可（签名不变）。
 *
 * 查询口径（docs/15 §6 + docs/14 §5.1）：
 *   `status='published'` + `deletedAt=null` + `(publishTime is null or <= now)`（C5 三条件）
 *   排序 `top desc, publishTime desc`；每页 **10** 条。
 */

export const PAGE_SIZE = 10;

export type ChannelArticlePage = {
  items: ArticleItem[];
  /** 收敛后的合法页码（1..totalPages） */
  page: number;
  total: number;
  totalPages: number;
};

/**
 * 把 URL 的 `page` 参数收敛成合法页码：非数字/小于 1 → 1；超出末页 → 末页（不报错、不空列表）。
 * `totalPages` 至少为 1，因此空结果集也会返回 `page=1`。
 */
export function normalizePage(raw: string | string[] | undefined, totalPages: number): number {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(first ?? "", 10);
  const last = Math.max(1, totalPages);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, last);
}

export async function fetchChannelArticles(options: {
  siteId: string;
  channelId: string;
  /** 直接传 `searchParams` 里的原始值即可（本函数内部负责收敛） */
  pageParam?: string | string[];
  pageSize?: number;
}): Promise<ChannelArticlePage> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const now = new Date();

  const where = {
    siteId: options.siteId,
    channelId: options.channelId,
    status: "published",
    deletedAt: null,
    OR: [{ publishTime: null }, { publishTime: { lte: now } }],
  };

  const total = await prisma.article.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = normalizePage(options.pageParam, totalPages);

  const items = await prisma.article.findMany({
    where,
    orderBy: [{ top: "desc" }, { publishTime: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      cover: true,
      publishTime: true,
      channel: { select: { name: true, slug: true } },
    },
  });

  return { items, page, total, totalPages };
}

type ArticleListProps = {
  items: ArticleItem[];
  /** 站点 slug：用于生成文章详情链接 */
  siteSlug: string;
  className?: string;
  /** 空态文案（默认取 i18n `news.emptyList`） */
  emptyText?: string;
};

export async function ArticleList({ items, siteSlug, className, emptyText }: ArticleListProps) {
  // Server Component → `getTranslations`；`emptyText` 显式传入时优先
  const t = await getTranslations("news");

  if (items.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border bg-surface p-card text-center text-sm text-muted-foreground">
        {emptyText ?? t("emptyList")}
      </p>
    );
  }

  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden rounded-card border border-border bg-card",
        className,
      )}
    >
      {items.map((article, index) => (
        <li key={article.id} className="px-4">
          <ArticleCard article={article} variant="compact" index={index} siteSlug={siteSlug} />
        </li>
      ))}
    </ul>
  );
}
