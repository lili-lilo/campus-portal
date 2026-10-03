import type { Metadata } from "next";
import Link from "next/link";

import { ArticleFilter } from "@/components/admin/article-filter";
import { ArticleTable } from "@/components/admin/article-table";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";

import { listArticles } from "./actions";

export const metadata: Metadata = { title: "内容管理" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx` L47） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/**
 * 页面层收敛（T3.3 裁决 Q4 第一层）：
 * `string | string[] | undefined` → `string | undefined`
 *   · 数组取首值（`?status=a&status=b`）
 *   · 空串 / 纯空白 → `undefined`（原生 `<select>` 的「全部状态」提交 `status=` 即走此路）
 * number 解析、边界钳制、排序白名单回落在 `./actions.ts` 内做（第二层）。
 */
function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

export default async function ArticlesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;

  // "新建文章"入口按 `article.create` 条件渲染（docs/15 §9.1 L423；T4.1c）
  const session = await auth();
  const role = session?.user.role;
  const canCreate = role !== undefined && isRole(role) && can(role, "article.create");

  const filters = {
    channelId: firstValue(sp.channelId),
    status: firstValue(sp.status),
    keyword: firstValue(sp.keyword),
    page: firstValue(sp.page),
    pageSize: firstValue(sp.pageSize),
    sortBy: firstValue(sp.sortBy),
    sortOrder: firstValue(sp.sortOrder),
  };

  const result = await listArticles(filters);

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">内容管理</h1>
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {result.message}
        </p>
      </div>
    );
  }

  const { items, page, total, totalPages, hasNext } = result.data;

  // 分页链接必须保留现有筛选（T3.3 裁决 Q4）：status / keyword / sortBy / sortOrder / pageSize
  const preserved = new URLSearchParams();
  if (filters.status) {
    preserved.set("status", filters.status);
  }
  if (filters.keyword) {
    preserved.set("keyword", filters.keyword);
  }
  if (filters.sortBy) {
    preserved.set("sortBy", filters.sortBy);
  }
  if (filters.sortOrder) {
    preserved.set("sortOrder", filters.sortOrder);
  }
  if (filters.pageSize) {
    preserved.set("pageSize", filters.pageSize);
  }

  /** `page=1` 时省略该参数（干净 URL，与 T2.4 的 `list-pagination` 同口径） */
  function pageHref(target: number): string {
    const params = new URLSearchParams(preserved);
    if (target > 1) {
      params.set("page", String(target));
    }
    const query = params.toString();
    return query ? `/admin/articles?${query}` : "/admin/articles";
  }

  const disabledClass = cn(
    buttonVariants({ variant: "outline", size: "sm" }),
    "pointer-events-none opacity-50",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">内容管理</h1>
          <p className="text-sm text-muted-foreground">共 {total} 篇文章</p>
        </div>

        {canCreate ? (
          <Link
            className={buttonVariants({ variant: "default", size: "sm" })}
            href="/admin/articles/new"
          >
            新建文章
          </Link>
        ) : null}
      </div>

      <ArticleFilter status={filters.status} keyword={filters.keyword} />

      <ArticleTable items={items} />

      {/* 分页（内联；T2.4 口径：`buttonVariants()` + 裸 `<a>`，不用 `PaginationLink`） */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          第 {page} / {totalPages} 页
        </p>

        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={pageHref(page - 1)}
            >
              上一页
            </Link>
          ) : (
            <span className={disabledClass} aria-disabled="true">
              上一页
            </span>
          )}

          {hasNext ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={pageHref(page + 1)}
            >
              下一页
            </Link>
          ) : (
            <span className={disabledClass} aria-disabled="true">
              下一页
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
