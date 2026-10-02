import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContent } from "@/components/page-content";
import { getPublicPage } from "@/lib/pages";
import { getSiteContext } from "@/lib/site-context";

// ISR：docs/15 §6 规定单页 revalidate = 3600
export const revalidate = 3600;

/**
 * 联系我们（`Channel.type = "page"`）
 * 数据：`getPublicPage()` 按 `siteId + slug` 查 `Page` 表（seed 里 slug = `contact`）。
 * **刻意不读 `searchParams`**（会把路由降级为逐请求动态渲染，与 ISR 3600 冲突）。
 *
 * ⚠ 待办（T3/T5）：页脚的地址 / 电话 / 邮箱 / 备案号仍读 `messages` 占位值，
 *   后续应与本页一起改读 `Config(group='site')`（见 docs/00 §8 #55 的同类事项）。
 */
const PAGE_SLUG = "contact";

type PageParams = { locale: string; site: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { site: siteSlug } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    return { title: "联系我们" };
  }

  const page = await getPublicPage({ siteId: context.site.id, slug: PAGE_SLUG });
  return { title: page?.title ?? "联系我们" };
}

export default async function AboutContactPage({ params }: { params: Promise<PageParams> }) {
  const { site: siteSlug } = await params;

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
        channelName={page.channel?.name}
      />
    </div>
  );
}
