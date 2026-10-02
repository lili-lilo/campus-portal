"use client";

import { CalendarDaysIcon } from "lucide-react";
import { cn } from "cn";

import { articleHref, type ArticleItem } from "@/components/article-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { formatListDate } from "@/lib/date";

/**
 * 通知公告标签页（T2.2）—— **Client Component**（`tabs` 是交互组件）
 * ============================================================================
 * · 输入 `tabs: Array<{ key, label, items: ArticleItem[] }>`，**默认选中第一个 tab**
 * · 每个 tab 最多显示 **6 条**：标题 + 日期（日期用 `@/lib/date` 的 `formatListDate`，Asia/Shanghai 唯一实现）
 * · 空态：`暂无内容`（文案待 T2.8 迁 i18n）
 * · 链接由 `articleHref(article, siteSlug)` 生成；缺 `siteSlug` 时降级为非链接行（不报错）
 *
 * 故意保持"哑组件"：只接收 props，不做任何数据查询（查询在 T2.3 的 Server Component 里做）。
 */

export type NoticeTab = {
  key: string;
  label: string;
  items: ArticleItem[];
};

const MAX_ITEMS = 6;

type NoticeTabsProps = {
  tabs: NoticeTab[];
  /** 站点 slug：传了才生成文章链接 */
  siteSlug?: string;
  className?: string;
};

export function NoticeTabs({ tabs, siteSlug, className }: NoticeTabsProps) {
  const first = tabs[0]?.key;
  if (!first) {
    return null;
  }

  return (
    <Tabs defaultValue={first} className={cn("w-full", className)}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.map((tab) => {
        const items = tab.items.slice(0, MAX_ITEMS);

        return (
          <TabsContent key={tab.key} value={tab.key} className="mt-4">
            {items.length === 0 ? (
              <p className="rounded-card border border-dashed border-border bg-surface p-card text-center text-sm text-muted-foreground">
                {/* TODO(T2.8)：迁 i18n */}
                暂无内容
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-card border border-border bg-card">
                {items.map((article) => {
                  const href = articleHref(article, siteSlug);
                  const row = (
                    <span className="flex items-start justify-between gap-4 py-3">
                      <span className="line-clamp-1 text-sm text-foreground transition-colors duration-200 group-hover:text-primary">
                        {article.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
                        {formatListDate(article.publishTime)}
                      </span>
                    </span>
                  );

                  return (
                    <li key={article.id} className="px-4">
                      {href ? (
                        <Link href={href} className="group block">
                          {row}
                        </Link>
                      ) : (
                        <span className="block">{row}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
