import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageContent } from "@/components/page-content";
import { localizedName } from "@/lib/localized-name";
import { getPublicPage } from "@/lib/pages";
import { getSiteContext } from "@/lib/site-context";

// ISR：docs/15 §6 规定单页 revalidate = 3600
export const revalidate = 3600;

/**
 * 学校简介（`Channel.type = "page"`，docs/15 §6）
 * ============================================================================
 * · 数据：`getPublicPage()` 按 `siteId + slug` 查 `Page` 表（seed 的 `seedPages()` 里
 *   主站该页 slug = `about`，栏目也是 `about`；子站 cs/ee/ba 同样有 `about` 页 ⇒ 同一路由
 *   也能服务子站的「学院概况」）
 * · 不存在 / `status !== published` / `deletedAt` → `notFound()`（不泄露未发布页存在性）
 * · **刻意不读 `searchParams`**：Next 16 里访问它会把路由降级为**逐请求动态渲染**，
 *   与 docs/15 §6 要求的 ISR 3600 冲突（单页没有查询参数需求）
 */
const PAGE_SLUG = "about";

type PageParams = { locale: string; site: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale, site: siteSlug } = await params;
  // M5-1b-2（C 类）：兜底标题「学校概况」→ i18n `nav.about`
  const t = await getTranslations({ locale, namespace: "nav" });

  const context = await getSiteContext(siteSlug);
  if (!context) {
    return { title: t("about") };
  }

  // 与页面正文共用 `cache()` 包裹的加载器 → 同请求只查一次库
  const page = await getPublicPage({ siteId: context.site.id, slug: PAGE_SLUG });
  return { title: page?.title ?? t("about") };
}

export default async function AboutPage({ params }: { params: Promise<PageParams> }) {
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
