import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommentList } from "@/components/admin/comment-list";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

import { listComments } from "./actions";

export const metadata: Metadata = { title: "评论管理" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx`） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 评论管理（M5-4a）—— `docs/15` §9.1 **L433** 的 `/admin/comments` 行
 * ============================================================================
 * · 页面 gate = **`menu.comments`**（与 sidebar 同码 ⇒ `editor` 访问 404）；Action 层另有
 *   **L2 `comment.manage`**（两层鉴权，与 `docs/14` §5.4 权限列一致）
 * · 数据源 = `listComments`（`docs/14` L408），**单页 + 查询参数**（M5-4a 裁决 ①）：
 *   `?status=` 筛选 / `?articleId=` 限定文章 / `?page=` 分页 —— 全走原生 GET（零客户端 JS）
 * · 列表**平铺**（顶级与回复同为行，回复行加 `↳` + 左侧缩进），`status` 过滤覆盖所有层级
 *   ⇒ 待审回复不会被漏审
 * · 文案硬编码中文：沿 T3.2 裁决 6（后台不做 i18n）
 */
export default async function CommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; articleId?: string; page?: string; error?: string }>;
}) {
  const {
    status: rawStatus,
    articleId: rawArticleId,
    page: rawPage,
    error: rawError,
  } = await searchParams;

  const session = await auth();
  const role = session?.user.role;

  if (!role || !isRole(role) || !can(role, "menu.comments")) {
    notFound();
  }

  const status = rawStatus?.trim() || undefined;
  const articleId = rawArticleId?.trim() || undefined;

  const result = await listComments({ status, articleId, page: rawPage, pageSize: "20" });

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">评论管理</h1>
        <p role="alert" className={ALERT_CLASS}>
          {result.message}
        </p>
      </div>
    );
  }

  const { items, page, totalPages, hasNext, total } = result.data;

  // 待审计数：单独一次轻量查询（列表已分页，不能从当前页推断）
  const pendingResult = await listComments({ status: "pending", page: "1", pageSize: "1" });
  const pendingTotal = pendingResult.ok ? pendingResult.data.total : 0;

  /** 保留 `status` / `articleId` 的分页链接 */
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (articleId) params.set("articleId", articleId);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/comments?${query}` : "/admin/comments";
  };

  const disabledClass = `${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-50`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">评论管理</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 条 · 待审 {pendingTotal} 条（权限：menu.comments / comment.manage）
        </p>
      </div>

      {rawError ? (
        <p role="alert" className={ALERT_CLASS}>
          {rawError}
        </p>
      ) : null}

      {/* 状态筛选：原生 GET 表单（零客户端 JS），按钮 `name="status"` 的值即提交值 */}
      <form method="get" action="/admin/comments" className="flex flex-wrap items-center gap-2">
        {articleId ? <input type="hidden" name="articleId" value={articleId} /> : null}
        {[
          { value: "", label: "全部" },
          { value: "pending", label: "待审" },
          { value: "approved", label: "已通过" },
          { value: "rejected", label: "已驳回" },
        ].map((option) => {
          const active = (status ?? "") === option.value;
          return (
            <button
              key={option.value || "all"}
              type="submit"
              name="status"
              value={option.value}
              aria-pressed={active}
              className={buttonVariants({
                variant: active ? "default" : "outline",
                size: "sm",
              })}
            >
              {option.label}
            </button>
          );
        })}
      </form>

      <CommentList items={items} />

      {total > 0 ? (
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
      ) : null}
    </div>
  );
}
