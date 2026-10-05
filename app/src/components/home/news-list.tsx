import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { ArticleCard, type ArticleItem } from "@/components/article-card";
import { SectionHeading } from "@/components/site/section-heading";

/**
 * 新闻网格（T2.2）—— **Server Component**（无交互，只接收 props）
 * ============================================================================
 * · 每条：左侧缩略图（`CoverBlock` 渐变兜底）+ 标题 + 日期 + 摘要
 * · 布局：**移动 1 列 / 桌面 3 列**（`lg:grid-cols-3`）
 * · 传 `title` 时自动带一个 `SectionHeading`（M6 视觉改造批次 2：竖条 + 英文副题，含可选 `moreHref`）
 * · 空态：`news.emptyList`（真跑 i18n，不再硬编码）
 */

type NewsListProps = {
  items: ArticleItem[];
  title?: string;
  subtitle?: string;
  moreHref?: string;
  /** 站点 slug：传了就自动生成文章链接（T2.3 组装首页时从 `[site]` 参数传下来） */
  siteSlug?: string;
  className?: string;
};

export async function NewsList({
  items,
  title,
  subtitle,
  moreHref,
  siteSlug,
  className,
}: NewsListProps) {
  // Server Component → `getTranslations`
  const t = await getTranslations("news");

  return (
    <section
      className={cn("w-full", className)}
      aria-labelledby={title ? "home-news-title" : undefined}
    >
      {title ? (
        <SectionHeading
          id="home-news-title"
          title={title}
          subtitle={subtitle}
          moreHref={moreHref}
        />
      ) : null}

      {items.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-border bg-surface p-card text-center text-sm text-muted-foreground">
          {t("emptyList")}
        </p>
      ) : (
        <ul className={cn("mt-6 grid gap-6", "sm:grid-cols-2 lg:grid-cols-3", title ? "" : "mt-0")}>
          {items.map((article, index) => (
            <li key={article.id} className="h-full">
              <ArticleCard article={article} index={index} siteSlug={siteSlug} variant="default" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
