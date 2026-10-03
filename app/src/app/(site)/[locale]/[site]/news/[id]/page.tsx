import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ArticleDetail, fetchArticleDetail } from "@/components/article-detail";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RelatedArticles } from "@/components/related-articles";
import { localizedName } from "@/lib/localized-name";
import { getSiteContext } from "@/lib/site-context";

// ISR：docs/15 §6 规定详情页 revalidate = 300
export const revalidate = 300;

type DetailParams = { locale: string; site: string; id: string };

/**
 * 新闻详情（docs/15 §1 `news/[id]`；U2 裁决：本静态段优先于 `[channel]/[id]`）
 * ============================================================================
 * · `id` 可能是 **slug 或 id**（docs/14 §5.1 的 `[idOrSlug]`）→ 由 `fetchArticleDetail` 同时匹配
 * · 未找到 / 未发布 / 已删除 / 未到发布时间 → `notFound()`（不泄露草稿存在性）
 * · 区块顺序：面包屑 → 正文详情（标题/元信息/封面/正文/附件）→ 相关阅读
 * · `generateMetadata` 与页面**共用** `fetchArticleDetail`（React `cache()` → 同请求只查一次库）
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<DetailParams>;
}): Promise<Metadata> {
  const { site: siteSlug, id } = await params;
  const context = await getSiteContext(siteSlug);

  if (!context) {
    return { title: "新闻详情" };
  }

  const article = await fetchArticleDetail({ siteId: context.site.id, idOrSlug: id });
  return { title: article?.title ?? "新闻详情" };
}

export default async function NewsDetailPage({ params }: { params: Promise<DetailParams> }) {
  const { locale, site: siteSlug, id } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  // M5-1b-2（C 类）：面包屑「首页」与栏目名走 i18n / 双语
  const t = await getTranslations({ locale, namespace: "nav" });

  const article = await fetchArticleDetail({ siteId: context.site.id, idOrSlug: id });
  if (!article) {
    notFound();
  }

  const channelSlug = article.channel?.slug ?? "news";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-gutter py-section-sm">
      {/* ① 面包屑：首页 / 栏目 / 标题 */}
      <Breadcrumbs
        items={[
          { label: t("home"), href: `/${siteSlug}` },
          {
            label: article.channel ? localizedName(article.channel, locale) : t("news"),
            href: `/${siteSlug}/${channelSlug}`,
          },
          { label: article.title },
        ]}
      />

      {/* ②~⑤ 标题 / 元信息 / 封面 / 正文 / 附件 */}
      <ArticleDetail article={article} siteSlug={siteSlug} />

      {/* ⑥ 相关阅读（同栏目 exclude 自身，最多 5 条） */}
      <RelatedArticles
        siteId={article.siteId}
        channelId={article.channelId}
        currentId={article.id}
        siteSlug={siteSlug}
        className="border-t border-border pt-8"
      />
    </div>
  );
}
