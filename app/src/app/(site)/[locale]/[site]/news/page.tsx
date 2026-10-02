import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleList, fetchChannelArticles } from "@/components/article-list";
import { ListPagination } from "@/components/list-pagination";
import { prisma } from "@/lib/prisma";
import { getSiteContext } from "@/lib/site-context";

export const metadata: Metadata = { title: "新闻中心" };

// ISR：docs/15 §6 规定 revalidate = 300
export const revalidate = 300;

/** 本页固定绑定的栏目 slug（保留 slug，由静态路由接管；docs/15 §4.1 / A19） */
const CHANNEL_SLUG = "news";

/**
 * 新闻中心列表页（T2.4 通用化）
 * ============================================================================
 * 结构：栏目名标题 → `ArticleList`（复用 T2.2 卡片）→ `ListPagination`（URL 参数驱动）
 * 数据：`Article` 按 `siteId + channelId` 过滤，口径与 `docs/13` C5 一致（含定时发布），每页 10 条
 * Next 16 注意：`params` 与 **`searchParams` 都是 Promise**，必须分别 `await`
 */
export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; site: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, site: siteSlug } = await params;
  const { page: pageParam } = await searchParams;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  const channel = await prisma.channel.findFirst({
    where: { siteId: context.site.id, slug: CHANNEL_SLUG, status: true },
    select: { id: true, name: true },
  });
  if (!channel) {
    notFound();
  }

  const { items, page, total, totalPages } = await fetchChannelArticles({
    siteId: context.site.id,
    channelId: channel.id,
    pageParam,
  });

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-gutter py-section-sm">
      {/* ① 标题：栏目名取自 Channel.name */}
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {channel.name}
        </h1>
        <p className="text-sm text-muted-foreground">共 {total} 篇</p>
      </div>

      {/* ② 列表（空态由 ArticleList 内部渲染"暂无文章"） */}
      <ArticleList items={items} siteSlug={siteSlug} />

      {/* ③ 分页（totalPages <= 1 时组件自身返回 null） */}
      <ListPagination
        page={page}
        totalPages={totalPages}
        basePath={`/${siteSlug}/${CHANNEL_SLUG}`}
        locale={locale}
      />
    </div>
  );
}
