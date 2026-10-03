import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ArticleDetail, fetchArticleDetail } from "@/components/article-detail";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RelatedArticles } from "@/components/related-articles";
import { localizedName } from "@/lib/localized-name";
import { prisma } from "@/lib/prisma";
import { getSiteContext } from "@/lib/site-context";

// ISR：docs/15 §6 规定详情页 revalidate = 300
export const revalidate = 300;

type DetailParams = { locale: string; site: string; channel: string; id: string };

/**
 * 非保留 slug 栏目下的文章详情（docs/15 §4.4 / `[channel]/[id]`）
 * ============================================================================
 * 与 `news/[id]` 读**同一份 `Article`、渲染同一套组件**（docs/15 §4.4），差异只有两点：
 *   1. 先按路径里的 `[channel]` 查栏目，并**要求 `type='list'`** ——
 *      `page` / `link` / `form` 型栏目不提供文章详情（404）；
 *   2. 详情查询带上 `channelId`，保证"路径栏目 = 文章所属栏目"（避免跨栏目串链）
 *
 * 例（seed 实测）：`/cs/programs/<slug>`、`/main/notice/<slug>`（notice 是 list 型，走本页）。
 * ⚠ 主站 8 个顶级栏目的 slug 都是保留 slug，由静态路由接管（A19 修订），
 *   故 `/main/news/<id>` 永远走 `news/[id]`（U2 已由 `tests/unit/route-matching.test.ts` 钉住）。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<DetailParams>;
}): Promise<Metadata> {
  const { site: siteSlug, id } = await params;
  const context = await getSiteContext(siteSlug);

  if (!context) {
    return { title: "文章详情" };
  }

  const article = await fetchArticleDetail({ siteId: context.site.id, idOrSlug: id });
  return { title: article?.title ?? "文章详情" };
}

export default async function ChannelArticlePage({ params }: { params: Promise<DetailParams> }) {
  const { locale, site: siteSlug, channel: channelSlug, id } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  // M5-1b-2（C 类）：面包屑「首页」与栏目名走 i18n / 双语
  const t = await getTranslations({ locale, namespace: "nav" });

  const channel = await prisma.channel.findFirst({
    where: { siteId: context.site.id, slug: channelSlug, status: true },
    select: { id: true, name: true, nameEn: true, type: true },
  });

  // 栏目不存在 / 已停用 / **非 list 型**（page、link、form 都没有文章详情）→ 404
  if (!channel || channel.type !== "list") {
    notFound();
  }

  const article = await fetchArticleDetail({
    siteId: context.site.id,
    idOrSlug: id,
    channelId: channel.id,
  });
  if (!article) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-gutter py-section-sm">
      {/* ① 面包屑：首页 / 栏目 / 标题 */}
      <Breadcrumbs
        items={[
          { label: t("home"), href: `/${siteSlug}` },
          { label: localizedName(channel, locale), href: `/${siteSlug}/${channelSlug}` },
          { label: article.title },
        ]}
      />

      {/* ②~⑤ 标题 / 元信息 / 封面 / 正文 / 附件 */}
      <ArticleDetail article={article} siteSlug={siteSlug} />

      {/* ⑥ 相关阅读 */}
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
