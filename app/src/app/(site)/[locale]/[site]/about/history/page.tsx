import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/page-content";
import { localizedName } from "@/lib/localized-name";
import { getPublicPage } from "@/lib/pages";
import { getSiteContext } from "@/lib/site-context";

// ISR：docs/15 §6 规定单页 revalidate = 3600
export const revalidate = 3600;

/**
 * 历史沿革（`Channel.type = "page"`）
 * 数据：`getPublicPage()` 按 `siteId + slug` 查 `Page` 表（seed 里 slug = `history`）。
 * **刻意不读 `searchParams`**（会把路由降级为逐请求动态渲染，与 ISR 3600 冲突）。
 */
const PAGE_SLUG = "history";

type PageParams = { locale: string; site: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { site: siteSlug } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    return { title: "历史沿革" };
  }

  const page = await getPublicPage({ siteId: context.site.id, slug: PAGE_SLUG });
  return { title: page?.title ?? "历史沿革" };
}

export default async function AboutHistoryPage({ params }: { params: Promise<PageParams> }) {
  const { locale, site: siteSlug } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  const page = await getPublicPage({ siteId: context.site.id, slug: PAGE_SLUG });
  if (!page) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-gutter py-section-sm">
      <PageContent
        page={{ title: page.title, content: page.content, updatedAt: page.updatedAt }}
        channelName={page.channel ? localizedName(page.channel, locale) : null}
      />
    </div>
  );
}
