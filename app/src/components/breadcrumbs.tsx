import { Link } from "@/i18n/navigation";
import { cn } from "cn";

/**
 * 面包屑（T2.5）—— Server Component
 * ============================================================================
 * · 以 `/` 分隔；**最后一项**为当前页（`aria-current="page"`，高亮、不可点）
 * · 项带 `href` 时用 next-intl `Link`（自动处理 `/en` 前缀）；不带 `href` 的中间项渲染为纯文本
 * · 「首页」的链接由调用方给成 `/[site]`（站点首页），本组件不假设任何站点信息
 */

export type BreadcrumbItem = {
  label: string;
  /** 站内路径（如 `/main/news`）；最后一项无 href */
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="面包屑" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-x-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-border">
                  /
                </span>
              ) : null}

              {isLast || !item.href ? (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn(
                    "line-clamp-1",
                    isLast ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="line-clamp-1 rounded transition-colors duration-200 hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
