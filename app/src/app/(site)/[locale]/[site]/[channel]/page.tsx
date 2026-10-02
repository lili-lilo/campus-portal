import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ArticleList, fetchChannelArticles } from "@/components/article-list";
import { ListPagination } from "@/components/list-pagination";
import { prisma } from "@/lib/prisma";
import { getSiteContext } from "@/lib/site-context";

export const metadata: Metadata = { title: "栏目" };

// ISR：docs/15 §6 规定通用栏目页 revalidate = 300
export const revalidate = 300;

/**
 * 通用栏目页 —— `[channel]` **四分支**（docs/15 §4.3 / A20）
 * ============================================================================
 * T2.4 起改为**读真实 `Channel` 表**（替换 T1.6 的硬编码 `CHANNEL_TYPES`，
 * 即 `docs/00` §8 #37 三处硬编码中的**第 ② 处已消除**）：
 *
 * | 分支 | `Channel.type` | 渲染 |
 * |---|---|---|
 * | 1 | `list` | **本页渲染文章列表 + 分页**（与 6 个静态列表页同一套组件） |
 * | 2 | `page` | 单页正文占位（**T2.6** 接入 `getPage` / `Page` 表；该栏目无 Page 记录时 404） |
 * | 3 | `link` | **服务端 302** → `Channel.url`；`url` 为空 → 404（U1） |
 * | 4 | `form` | **404**（docs/14 §8 A2：本期不做前台表单渲染） |
 * | 0 | 栏目不存在 / `status=false` | 404（命中 `[channel]/not-found.tsx`） |
 *
 * 注：主站 8 个顶级栏目的 slug 全部是**保留 slug**，由静态路由接管（A19 修订）→
 * 本页实际只服务子站的 `programs`(list) 等；`link` / `form` 分支当前 seed 无数据，
 * 但逻辑已按规格实现，待后台建栏目后即可生效。
 */
export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; site: string; channel: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, site: siteSlug, channel: channelSlug } = await params;
  const { page: pageParam } = await searchParams;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  const channel = await prisma.channel.findFirst({
    where: { siteId: context.site.id, slug: channelSlug, status: true },
    select: { id: true, name: true, type: true, url: true },
  });

  // ── 分支 0：栏目不存在 / 已停用 ──
  if (!channel) {
    notFound();
  }

  // ── 分支 4：form（本期不渲染前台表单）──
  if (channel.type === "form") {
    notFound();
  }

  // ── 分支 3：link（302 外链/自定义路径）──
  if (channel.type === "link") {
    if (!channel.url) {
      notFound();
    }
    redirect(channel.url);
  }

  // ── 分支 2：page（单页正文；T2.6 接入）──
  if (channel.type === "page") {
    return (
      <div className="mx-auto w-full max-w-page space-y-4 px-gutter py-section-sm">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {channel.name}
        </h1>
        <p className="rounded-card border border-dashed border-border bg-surface p-card text-sm text-muted-foreground">
          单页正文将在 T2.6 接入（`getPage` / `Page` 表，docs/14 §5.2）；当前栏目类型为 `page`。
        </p>
      </div>
    );
  }

  // ── 分支 1：list（文章列表 + 分页；空列表显示空态，不 404）──
  const { items, page, total, totalPages } = await fetchChannelArticles({
    siteId: context.site.id,
    channelId: channel.id,
    pageParam,
  });

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-gutter py-section-sm">
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {channel.name}
        </h1>
        <p className="text-sm text-muted-foreground">共 {total} 篇</p>
      </div>

      <ArticleList items={items} siteSlug={siteSlug} />

      <ListPagination
        page={page}
        totalPages={totalPages}
        basePath={`/${siteSlug}/${channelSlug}`}
        locale={locale}
      />
    </div>
  );
}
