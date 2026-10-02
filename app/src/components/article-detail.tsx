import { CalendarDaysIcon, EyeIcon, UserIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { cn } from "cn";

import { AttachmentList, type AttachmentItem } from "@/components/attachment-list";
import { CoverBlock, type ArticleItem } from "@/components/article-card";
import { Link } from "@/i18n/navigation";
import { formatDetailDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * 文章详情（T2.5）—— Server Component + 同文件导出的加载器
 * ============================================================================
 * 渲染区块（页面结构第 2~5 项）：标题 / 元信息 / 封面 / 正文（清洗后）/ 附件。
 * 第 1 项（面包屑）与第 6 项（相关阅读）由**页面**组合（各自独立组件）。
 *
 * `fetchArticleDetail` 用 React `cache()` 包裹：同一次请求内
 * `generateMetadata()` 与页面正文**只查一次库**（两处都调用同一函数）。
 *
 * ⚠ `id` 参数可能是 **slug 也可能是 id**（docs/14 §5.1 的 `[idOrSlug]`）——
 *   查询用 `AND: [{ OR: [{id}, {slug}] }, …]` 同时匹配两者，调用方无需判断。
 * ⚠ 正文渲染：`sanitizeHtml()` 做白名单清洗后才 `dangerouslySetInnerHTML`（A30 纵深防御）。
 */

export type ArticleDetailData = ArticleItem & {
  content: string;
  author: string | null;
  source: string | null;
  viewCount: number;
  siteId: string;
  channelId: string;
  attachments: AttachmentItem[];
};

/**
 * 取文章详情（只返回**可前台展示**的文章：`published` + 未删除 + 已到发布时间）。
 * 未发布/不存在一律返回 `null` → 调用方 `notFound()`（**不泄露草稿存在性**，docs/14 §5.1）。
 *
 * ⚠ `select` **必须内联**在 `findFirst` 实参里：若抽成独立常量，`orderBy: [{ sort: "asc" }]`
 *   中的 `"asc"` 会被 TS 拓宽为 `string`，不再满足 Prisma 的 `SortOrder`（实测 TS2322）。
 *   对象字面量作为实参享有**上下文类型**，字面量保持窄类型 ✓
 */
export const fetchArticleDetail = cache(
  async (options: {
    siteId: string;
    /** slug 或 id 均可 */
    idOrSlug: string;
    /** 传了就要求文章属于该栏目（`[channel]/[id]` 用；`news/[id]` 不传） */
    channelId?: string;
  }): Promise<ArticleDetailData | null> => {
    const now = new Date();

    return prisma.article.findFirst({
      where: {
        siteId: options.siteId,
        status: "published",
        deletedAt: null,
        ...(options.channelId ? { channelId: options.channelId } : {}),
        AND: [
          { OR: [{ id: options.idOrSlug }, { slug: options.idOrSlug }] },
          { OR: [{ publishTime: null }, { publishTime: { lte: now } }] },
        ],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        summary: true,
        cover: true,
        content: true,
        author: true,
        source: true,
        viewCount: true,
        publishTime: true,
        siteId: true,
        channelId: true,
        channel: { select: { name: true, slug: true } },
        attachments: {
          where: { deletedAt: null },
          orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
          select: { id: true, fileName: true, size: true, mimeType: true },
        },
      },
    });
  },
);

/** 正文排版（手写"typography"：不装 @tailwindcss/typography，用任意变体声明基础样式） */
const PROSE_CLASS = cn(
  "leading-body text-foreground",
  // 段落与区块间距
  "[&>*+*]:mt-4",
  // 标题
  "[&_h2]:mt-8 [&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-6 [&_h3]:font-heading [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_h4]:mt-4 [&_h4]:font-medium",
  // 段落
  "[&_p]:leading-body",
  // 列表
  "[&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6",
  // 链接与强调
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  "[&_em]:italic [&_strong]:font-semibold",
  // 引用 / 代码 / 分隔线
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-card [&_pre]:bg-surface [&_pre]:p-card",
  "[&_hr]:border-border",
  // 图片 / 表格
  "[&_img]:max-w-full [&_img]:rounded-lg",
  "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left",
);

type ArticleDetailProps = {
  article: ArticleDetailData;
  /** 站点 slug：栏目链接用 */
  siteSlug: string;
};

export async function ArticleDetail({ article, siteSlug }: ArticleDetailProps) {
  // Server Component → `getTranslations`
  const t = await getTranslations("news");
  const html = sanitizeHtml(article.content);

  return (
    <article className="space-y-6">
      {/* 标题 */}
      <h1 className="font-heading text-2xl leading-body font-semibold tracking-tight text-foreground md:text-3xl">
        {article.title}
      </h1>

      {/* 元信息：栏目（链接）/ 日期（Asia/Shanghai）/ 作者 / 浏览量 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {article.channel ? (
          <Link
            href={`/${siteSlug}/${article.channel.slug}`}
            className="rounded font-medium text-primary transition-colors duration-200 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {article.channel.name}
          </Link>
        ) : null}

        <span className="flex items-center gap-1">
          <CalendarDaysIcon className="size-4 shrink-0" aria-hidden="true" />
          {formatDetailDate(article.publishTime)}
        </span>

        {article.author ? (
          <span className="flex items-center gap-1">
            <UserIcon className="size-4 shrink-0" aria-hidden="true" />
            {article.author}
          </span>
        ) : null}

        <span className="flex items-center gap-1">
          <EyeIcon className="size-4 shrink-0" aria-hidden="true" />
          {t("views", { count: article.viewCount })}
        </span>
      </div>

      {/* 摘要（可选） */}
      {article.summary ? (
        <p className="rounded-card border-l-4 border-primary bg-surface p-card text-sm leading-body text-muted-foreground">
          {article.summary}
        </p>
      ) : null}

      {/* 封面（渐变兜底，见 docs/00 §8 #50） */}
      <CoverBlock
        title={article.title}
        cover={article.cover}
        index={0}
        className="aspect-[16/9] w-full rounded-card"
      />

      {/* 正文：白名单清洗后渲染 */}
      <div className={PROSE_CLASS} dangerouslySetInnerHTML={{ __html: html }} />

      {/* 附件（无附件时组件返回 null） */}
      <AttachmentList items={article.attachments} className="pt-4" />
    </article>
  );
}
