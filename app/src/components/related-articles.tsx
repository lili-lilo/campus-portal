import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { ArticleCard } from "@/components/article-card";
import { prisma } from "@/lib/prisma";

/**
 * 相关阅读（T2.5）—— Server Component（自带查询）
 * ============================================================================
 * 取**同栏目**已发布文章 5 条，`exclude` 当前文章；渲染复用 T2.2 的 `ArticleCard variant="compact"`。
 * 空结果 → 返回 `null`（调用方无需判断）。
 *
 * 查询口径与列表页一致（`docs/13` C5 三条件：`published` + `deletedAt=null` + 定时发布）。
 * ⚠ 未传 `siteSlug` 时卡片会退化为"非链接"（`ArticleCard` 的既有行为），故本组件把它列为**必填**。
 */

type RelatedArticlesProps = {
  siteId: string;
  channelId: string;
  /** 当前文章 id（排除自身） */
  currentId: string;
  /** 站点 slug：生成文章详情链接用 */
  siteSlug: string;
  className?: string;
};

export async function RelatedArticles({
  siteId,
  channelId,
  currentId,
  siteSlug,
  className,
}: RelatedArticlesProps) {
  const now = new Date();
  // Server Component → `getTranslations`
  const t = await getTranslations("news");

  const items = await prisma.article.findMany({
    where: {
      siteId,
      channelId,
      id: { not: currentId },
      status: "published",
      deletedAt: null,
      OR: [{ publishTime: null }, { publishTime: { lte: now } }],
    },
    orderBy: [{ top: "desc" }, { publishTime: "desc" }],
    take: 5,
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      cover: true,
      publishTime: true,
      channel: { select: { name: true, nameEn: true, slug: true } },
    },
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="related-articles" className={cn("space-y-4", className)}>
      <h2
        id="related-articles"
        className="font-heading text-xl font-semibold tracking-tight text-foreground"
      >
        {t("related")}
      </h2>

      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((article, index) => (
          <li key={article.id}>
            <ArticleCard article={article} variant="compact" index={index} siteSlug={siteSlug} />
          </li>
        ))}
      </ul>
    </section>
  );
}
