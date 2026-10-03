import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ArticleList, fetchChannelArticles } from "@/components/article-list";
import { ListPagination } from "@/components/list-pagination";
import { localizedName } from "@/lib/localized-name";
import { prisma } from "@/lib/prisma";
import { getSiteContext } from "@/lib/site-context";

// M5-1b-2（C 类）：静态中文标题 → `generateMetadata` + i18n（`nav.faculty`）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; site: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("faculty") };
}

// ISR：docs/15 §6 规定 revalidate = 3600
export const revalidate = 3600;

/** 本页固定绑定的栏目 slug（保留 slug，由静态路由接管；docs/15 §4.1 / A19） */
const CHANNEL_SLUG = "faculty";

/**
 * 师资队伍列表页（T2.4 通用化）—— 结构与 `news/page.tsx` 一致，仅栏目 slug 与缓存档不同。
 */
export default async function FacultyPage({
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
    select: { id: true, name: true, nameEn: true },
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
      <div className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          {localizedName(channel, locale)}
        </h1>
        <p className="text-sm text-muted-foreground">共 {total} 篇</p>
      </div>

      <ArticleList items={items} siteSlug={siteSlug} />

      <ListPagination
        page={page}
        totalPages={totalPages}
        basePath={`/${siteSlug}/${CHANNEL_SLUG}`}
        locale={locale}
      />
    </div>
  );
}
