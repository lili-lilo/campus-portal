import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";

import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";

/**
 * 列表页分页器（T2.4）—— Server Component，**URL 参数驱动**
 * ============================================================================
 * · 链接形如 `/{site}/news?page=2`；`page=1` 时**省略**该参数（干净的 canonical URL）
 * · **保留其它查询参数**（如 `?channel=xxx`，T2.7 搜索页的 `?q=`）—— 通过 `query` 传入
 * · 页码窗口：**永远显示第 1 页与末页** + 当前页左右各 2 页，中间用 `PaginationEllipsis`
 * · 首页时"上一页"、末页时"下一页"渲染为 `aria-disabled` 的不可点元素（不产生死链）
 * · 当前页带 `aria-current="page"` + shadcn 的 `outline` 高亮
 *
 * ⚠ **为什么不用 shadcn 的 `PaginationLink`**（两处硬原因）：
 *   1. `ui/pagination.tsx` L40-47 内部是 `&lt;Button asChild&gt;&lt;a/&gt;&lt;/Button&gt;` —— 与 T2.3 修掉的
 *      Radix Slot 问题（`docs/00` §8 #52）同形；本组件是 **Server Component**，避免再引入 Slot 路径
 *   2. `PaginationLink` 渲染**裸 `<a>`**，不会加 `/en` 前缀；本组件用 `locale` 手工拼前缀（当前只有 zh/en）
 *   仍复用 shadcn 的 `Pagination` / `PaginationContent` / `PaginationItem` / `PaginationEllipsis`
 *   与 `buttonVariants()`，外观与 shadcn 一致 ✓
 */

type QueryValue = string | string[] | undefined;

type ListPaginationProps = {
  /** 已收敛的当前页（1..totalPages） */
  page: number;
  totalPages: number;
  /** 站内基础路径，**不含 locale 前缀**，如 `/main/news` */
  basePath: string;
  /** 需要一并保留的查询参数 */
  query?: Record<string, QueryValue>;
  /** 当前 locale（`zh` 不带前缀，其余按 `/{locale}` 前缀；当前项目只有 zh/en） */
  locale: string;
  className?: string;
};

/** 页码窗口：1 … (page-2..page+2) … totalPages */
export function pageWindow(page: number, totalPages: number): (number | "ellipsis")[] {
  const side = 2;
  const start = Math.max(2, page - side);
  const end = Math.min(totalPages - 1, page + side);
  const items: (number | "ellipsis")[] = [1];

  if (start > 2) {
    items.push("ellipsis");
  }
  for (let p = start; p <= end; p += 1) {
    items.push(p);
  }
  if (end < totalPages - 1) {
    items.push("ellipsis");
  }
  if (totalPages > 1) {
    items.push(totalPages);
  }

  return items;
}

export function ListPagination({
  page,
  totalPages,
  basePath,
  query,
  locale,
  className,
}: ListPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const prefix = locale === "zh" ? "" : `/${locale}`;

  const hrefFor = (target: number): string => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      const single = Array.isArray(value) ? value[0] : value;
      if (single) {
        params.set(key, single);
      }
    }
    if (target > 1) {
      params.set("page", String(target));
    }
    const qs = params.toString();
    return `${prefix}${basePath}${qs ? `?${qs}` : ""}`;
  };

  const linkClass = buttonVariants({ variant: "ghost", size: "icon" });
  const arrowClass = buttonVariants({ variant: "ghost", size: "default" });
  const disabledClass = "pointer-events-none opacity-50";
  const pages = pageWindow(page, totalPages);

  return (
    <Pagination className={className}>
      <PaginationContent>
        {/* 上一页 */}
        <PaginationItem>
          {page > 1 ? (
            <a href={hrefFor(page - 1)} className={arrowClass} aria-label="上一页">
              <ChevronLeftIcon data-icon="inline-start" />
              <span className="hidden sm:block">上一页</span>
            </a>
          ) : (
            <span aria-disabled="true" className={cn(arrowClass, disabledClass)}>
              <ChevronLeftIcon data-icon="inline-start" />
              <span className="hidden sm:block">上一页</span>
            </span>
          )}
        </PaginationItem>

        {/* 页码（首尾页恒显，中间省略） */}
        {pages.map((item, index) =>
          item === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              {item === page ? (
                <a
                  href={hrefFor(item)}
                  aria-current="page"
                  className={cn(linkClass, "border-border")}
                  data-active="true"
                >
                  {item}
                </a>
              ) : (
                <a href={hrefFor(item)} className={linkClass} aria-label={`第 ${item} 页`}>
                  {item}
                </a>
              )}
            </PaginationItem>
          ),
        )}

        {/* 下一页 */}
        <PaginationItem>
          {page < totalPages ? (
            <a href={hrefFor(page + 1)} className={arrowClass} aria-label="下一页">
              <span className="hidden sm:block">下一页</span>
              <ChevronRightIcon data-icon="inline-end" />
            </a>
          ) : (
            <span aria-disabled="true" className={cn(arrowClass, disabledClass)}>
              <span className="hidden sm:block">下一页</span>
              <ChevronRightIcon data-icon="inline-end" />
            </span>
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
