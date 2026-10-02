import { CalendarDaysIcon } from "lucide-react";
import Image from "next/image";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { formatListDate } from "@/lib/date";

/**
 * 文章卡片（T2.2）+ 本批次首页组件的**共享类型与封面兜底**
 * ============================================================================
 * 本文件是 T2.2 的**公共底座**（`ArticleItem` / 渐变兜底 / `CoverBlock` 都在这里导出），
 * 由 `news-list`、`notice-tabs` 复用；**未新建 `types/home.ts`**（避免超出本轮 7 文件范围）。
 * 后续若类型继续扩散，T2.4 可把它上移到 `src/lib/article.ts`（签名不变）。
 *
 * 封面兜底（T2.1 裁决 #1 / `docs/00` §8 #50）：
 *   · **无 `cover`** → 渲染 token 渐变块 + 居中标题（文字色随渐变配深/浅，保证对比度）
 *   · **有 `cover`** → 叠一张 `<Image alt="">`；`public/uploads/**` 目前不存在（死链），
 *     而**空 `alt` 的破图浏览器不渲染破图图标** → 自动露出下层渐变，不会出现"碎图"
 *   · 真图与占位的切换只靠这一层，第 6 周补真图后无需改组件
 *   · `unoptimized`：跳过 `/_next/image` 优化器（本地路径不可优化；生产 Sharp 亦未启用）
 *
 * 渐变只用已注册 token（`primary` / `foreground` / `muted-foreground` / `gold` / `gold-text`），
 * **不新造色值**（T1.3 约定）。
 */

/** 首页/列表页统一的文章条目形状（T2.2 约定） */
export type ArticleItem = {
  id: string;
  title: string;
  slug: string;
  summary?: string | null;
  cover?: string | null;
  publishTime?: Date | null;
  channel?: { name: string; slug: string } | null;
};

/** 4 套封面样式：`bg` 是渐变，`text` 是与该渐变对比度达标的前景色 */
export const COVER_STYLES = [
  { bg: "bg-linear-to-br from-primary to-primary/60", text: "text-primary-foreground" },
  { bg: "bg-linear-to-br from-foreground to-muted-foreground", text: "text-background" },
  { bg: "bg-linear-to-br from-gold to-gold-text", text: "text-foreground" },
  { bg: "bg-linear-to-br from-muted-foreground to-foreground", text: "text-background" },
] as const;

/** 按索引轮转 4 套渐变（负数安全） */
export function coverStyle(index: number): { bg: string; text: string } {
  const size = COVER_STYLES.length;
  return COVER_STYLES[((index % size) + size) % size];
}

type CoverBlockProps = {
  title: string;
  /** 有值则叠图；为空则只显示渐变 + 标题 */
  cover?: string | null;
  /** 决定用第几套渐变（一般传列表索引） */
  index: number;
  className?: string;
};

/** 封面块：渐变兜底 + 可选叠图（`article-card` / `news-list` 共用） */
export function CoverBlock({ title, cover, index, className }: CoverBlockProps) {
  const style = coverStyle(index);

  return (
    <div className={cn("relative overflow-hidden", style.bg, className)}>
      {cover ? (
        <Image
          src={cover}
          alt=""
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover"
        />
      ) : (
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center p-4 text-center text-sm font-semibold",
            style.text,
          )}
        >
          {title}
        </span>
      )}
    </div>
  );
}

type ArticleCardProps = {
  article: ArticleItem;
  variant?: "default" | "compact";
  /** 决定渐变轮转位置（列表里传下标） */
  index?: number;
  /** 站点 slug：给了就能自动拼站内链接；不传或传 `href` 时以 `href` 为准 */
  siteSlug?: string;
  /** 显式链接（优先于 `siteSlug`）；两者都无 → 渲染为**非链接**卡片 */
  href?: string;
};

/** 站内文章链接：`/[site]/[channel]/[slug]`（与 docs/15 §4.4 一致）；缺 `siteSlug` 或栏目时返回 `null` */
export function articleHref(article: ArticleItem, siteSlug?: string): string | null {
  const channelSlug = article.channel?.slug;
  if (siteSlug && channelSlug) {
    return `/${siteSlug}/${channelSlug}/${article.slug}`;
  }
  return null;
}

export function ArticleCard({
  article,
  variant = "default",
  index = 0,
  siteSlug,
  href,
}: ArticleCardProps) {
  const target = href ?? articleHref(article, siteSlug);
  const date = formatListDate(article.publishTime);

  const title = (
    <span className="line-clamp-2 font-medium text-foreground transition-colors duration-200 group-hover:text-primary">
      {article.title}
    </span>
  );
  const meta = (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
      {date}
      {article.channel ? <span className="ml-1">· {article.channel.name}</span> : null}
    </span>
  );

  if (variant === "compact") {
    const body = (
      <div className="flex gap-3">
        <CoverBlock
          title={article.title}
          cover={article.cover}
          index={index}
          className="h-16 w-24 shrink-0 rounded-lg"
        />
        <div className="flex min-w-0 flex-col justify-between gap-1">
          {title}
          {meta}
        </div>
      </div>
    );

    return target ? (
      <Link href={target} className="group block rounded-lg p-2 hover:bg-surface">
        {body}
      </Link>
    ) : (
      <div className="group rounded-lg p-2">{body}</div>
    );
  }

  const card = (
    <Card className="group h-full gap-0 overflow-hidden border-border pt-0 shadow-card transition-shadow duration-200 hover:shadow-hover">
      <CoverBlock
        title={article.title}
        cover={article.cover}
        index={index}
        className="aspect-[16/10] w-full"
      />
      <CardHeader className="gap-2 pt-6">
        {article.channel ? (
          <Badge variant="secondary" className="w-fit">
            {article.channel.name}
          </Badge>
        ) : null}
        <CardTitle className="text-base leading-body">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        {article.summary ? (
          <p className="line-clamp-3 text-sm leading-body text-muted-foreground">
            {article.summary}
          </p>
        ) : null}
        {meta}
      </CardContent>
    </Card>
  );

  return target ? (
    <Link href={target} className="block h-full rounded-card focus-visible:outline-none">
      {card}
    </Link>
  ) : (
    card
  );
}
