import { ArrowRightIcon } from "lucide-react";
import { cn } from "cn";

import { Link } from "@/i18n/navigation";

/**
 * 区块标题（T2.2）—— Server Component
 * ============================================================================
 * 左侧：`h2`（`font-heading` 字号阶梯）+ 可选副标题；右侧：可选"更多 →"链接。
 * `moreHref` 走站内 next-intl `Link`（自动处理 `/en` 前缀）；`http(s)` 视为外链。
 *
 * 未做项：文案"更多"暂为硬编码（`messages/*.json` 不在本轮文件范围内，见 T2.1 同款处理）
 *          → TODO(T2.8) 迁 i18n `common.more`。
 */

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  /** 站内路径（如 `/main/news`）或外链 */
  moreHref?: string;
  /** 给 `h2` 的 id，便于区块 `aria-labelledby` 关联 */
  id?: string;
  className?: string;
};

export function SectionTitle({ title, subtitle, moreHref, id, className }: SectionTitleProps) {
  const external = moreHref ? /^https?:\/\//i.test(moreHref) : false;
  const moreClass =
    "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors duration-200 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 id={id} className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      {moreHref ? (
        external ? (
          <a href={moreHref} target="_blank" rel="noreferrer" className={moreClass}>
            更多
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </a>
        ) : (
          <Link href={moreHref} className={moreClass}>
            更多
            <ArrowRightIcon className="size-4" aria-hidden="true" />
          </Link>
        )
      ) : null}
    </div>
  );
}
