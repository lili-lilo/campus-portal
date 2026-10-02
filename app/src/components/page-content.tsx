import { ClockIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { formatListDate } from "@/lib/date";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * 单页内容（T2.6）—— Server Component
 * ============================================================================
 * · 顶部：`<h1>` 标题（+ 可选栏目名眉标）+ 更新时间（`<time>`，Asia/Shanghai 日期）
 * · 正文：`sanitizeHtml()` 白名单清洗后 `dangerouslySetInnerHTML`（复用 T2.5 的清洗器）
 * · 空正文：显示「该页面内容尚未发布」
 *
 * 排版用**手写 Tailwind**（不装 `@tailwindcss/typography`），风格与 `article-detail.tsx` 一致。
 * ⚠ 该样式串是 `article-detail` 里 `PROSE_CLASS` 的**子集**（刻意不 import：那是 T2.5 文件，
 *   本轮范围不允许改它）→ 后续可把两份合并到 `src/lib/prose.ts`（见 T2.6 报告"待办"）。
 *
 * ⚠ 空态文案走 i18n `common.pageEmpty`（T2.6 收尾修复；此前是硬编码中文）。
 */

/** 正文排版（与 article-detail 的 PROSE_CLASS 同源子集） */
const PROSE_CLASS = cn(
  "leading-body text-foreground",
  "[&>*+*]:mt-4",
  "[&_h2]:mt-8 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-6 [&_h3]:font-heading [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_h4]:mt-4 [&_h4]:font-medium",
  "[&_p]:leading-body",
  "[&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  "[&_em]:italic [&_strong]:font-semibold",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:bg-surface [&_pre]:p-card",
  "[&_hr]:border-border",
  "[&_img]:max-w-full [&_img]:rounded-lg",
  "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left",
);

type PageContentProps = {
  page: {
    title: string;
    content: string;
    updatedAt: Date;
  };
  /** 栏目名：有则在标题上方显示眉标 */
  channelName?: string | null;
  className?: string;
};

export async function PageContent({ page, channelName, className }: PageContentProps) {
  // Server Component → `getTranslations`（空态文案）
  const t = await getTranslations("common");

  const html = sanitizeHtml(page.content ?? "");
  const hasContent = html.trim().length > 0;

  return (
    <article className={cn("space-y-6", className)}>
      <header className="space-y-2">
        {channelName ? <p className="text-sm font-medium text-primary">{channelName}</p> : null}
        <h1 className="font-heading text-2xl leading-body font-semibold tracking-tight text-foreground md:text-3xl">
          {page.title}
        </h1>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <ClockIcon className="size-4 shrink-0" aria-hidden="true" />
          <time dateTime={page.updatedAt.toISOString()}>{formatListDate(page.updatedAt)}</time>
        </p>
      </header>

      {hasContent ? (
        <div className={PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="rounded-card border border-dashed border-border bg-surface p-card text-center text-sm text-muted-foreground">
          {t("pageEmpty")}
        </p>
      )}
    </article>
  );
}
