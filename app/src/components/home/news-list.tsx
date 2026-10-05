import { CalendarDaysIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { ArticleCard, articleHref, type ArticleItem } from "@/components/article-card";
import { SectionHeading } from "@/components/site/section-heading";
import { Link } from "@/i18n/navigation";
import { formatListDate } from "@/lib/date";

/**
 * 新闻区块（T2.2；**M6 视觉改造批次 3b：左大图 + 右标题列表**）
 * ============================================================================
 * 布局（≥lg）：**左 3/5 大图卡**（第一条要闻，含封面/栏目/摘要/日期）+ **右 2/5 标题列表**
 *   （其余条目：标题 2 行截断 + 日期，无图）。右侧用 `h-full + justify-between` 把条目
 *   在高度上匀开，避免与左侧大卡高度差太大。
 * `<lg`：单列堆叠（左侧大卡在上，列表在下）。
 * · 传 `title` 时自动带一个 `SectionHeading`（竖条 + 英文副题 + 可选「更多」）
 * · 空态：`news.emptyList`（真跑 i18n）
 * · 条目链接走 `articleHref(article, siteSlug)`（与 `ArticleCard` 同一实现）
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

  const lead = items[0];
  const rest = items.slice(1);

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
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          {/* 左 3/5：大图卡 */}
          {lead ? (
            <div className="lg:col-span-3">
              <ArticleCard article={lead} index={0} siteSlug={siteSlug} variant="default" />
            </div>
          ) : null}

          {/* 右 2/5：标题 + 日期列表 */}
          {rest.length > 0 ? (
            <ul className="flex h-full flex-col justify-between divide-y divide-border lg:col-span-2">
              {rest.map((article) => {
                const target = articleHref(article, siteSlug);
                const body = (
                  <span className="flex flex-col gap-1">
                    <span className="line-clamp-2 text-sm leading-body font-medium text-foreground transition-colors duration-200 group-hover:text-primary">
                      {article.title}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
                      {formatListDate(article.publishTime)}
                    </span>
                  </span>
                );

                return (
                  <li key={article.id} className="flex-1">
                    {target ? (
                      <Link
                        href={target}
                        className="group block rounded-lg px-2 py-3 transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {body}
                      </Link>
                    ) : (
                      <span className="group block px-2 py-3">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
