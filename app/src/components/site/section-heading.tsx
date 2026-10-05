import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import { Link } from "@/i18n/navigation";

/**
 * 区块标题（M6 视觉改造批次 1）—— **Server Component（async）**
 * ============================================================================
 * 对标 985 官网的区块标题：**左侧 4px 主题色竖条** + 标题（+ 可选英文副题）+ 右侧「更多 →」，
 * 底部一条细分割线。
 *
 * 与 `ui/section-title.tsx` 的关系：`ui/` 属冻结范围（不改），本组件是**前台专用替代**。
 * 接线方式：本批只新建，**尚未在页面中使用**——避免与 `ui/section-title` 混用出现两套标题观感；
 * 批次 2 统一替换（同时补英文副题的 i18n key）。
 *
 * `moreHref` 走站内 next-intl `Link`（自动处理 `/en` 前缀）；`http(s)` 视为外链。
 */
type SectionHeadingProps = {
  title: string;
  /** 英文副题（如 "NEWS"），小号大写字距；缺省则不渲染 */
  subtitle?: string;
  /** 站内路径或外链 */
  moreHref?: string;
  /** 「更多」文案，缺省读 i18n `common.moreShort` */
  moreLabel?: string;
  /** 给 `h2` 的 id，便于区块 `aria-labelledby` 关联 */
  id?: string;
  className?: string;
};

export async function SectionHeading({
  title,
  subtitle,
  moreHref,
  moreLabel,
  id,
  className,
}: SectionHeadingProps) {
  const external = moreHref ? /^https?:\/\//i.test(moreHref) : false;
  const t = await getTranslations("common");
  const label = moreLabel ?? t("moreShort");
  const moreClass =
    "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  const moreBody = (
    <>
      {label}
      <ArrowRightIcon className="size-4" aria-hidden="true" />
    </>
  );

  return (
    <div
      className={cn("flex items-end justify-between gap-4 border-b border-border pb-3", className)}
    >
      <div className="flex min-w-0 items-stretch gap-3">
        {/* 主题色竖条（装饰，读屏忽略） */}
        <span className="w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2
            id={id}
            className="font-heading text-xl font-semibold tracking-tight text-foreground md:text-2xl"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs font-medium tracking-[0.2em] text-muted-foreground uppercase">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      {moreHref ? (
        external ? (
          <a href={moreHref} target="_blank" rel="noreferrer" className={moreClass}>
            {moreBody}
          </a>
        ) : (
          <Link href={moreHref} className={moreClass}>
            {moreBody}
          </Link>
        )
      ) : null}
    </div>
  );
}
