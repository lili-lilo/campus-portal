import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleForm } from "@/components/admin/article-form";
import { auth } from "@/lib/auth";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

import { getChannelTree } from "../actions";

export const metadata: Metadata = { title: "新建文章" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx` L47） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 新建文章（T3.5 → T4.1c 加页面 gate）—— Server Component 取栏目 → 交给客户端表单
 *
 * · 页面 gate（`docs/15` §9.1 L423 的权限列 = **`article.create`**）：不通过 → `notFound()`
 *   （T4.1c 补漏：此前 `auditor` 直接输 URL 即可进入并提交）
 * · 提交侧权威校验仍在 `createArticle` 内的 L2（本步同时补齐）
 * · `siteId` 由 `getChannelTree` 内部按数据范围收敛（super_admin 传 `undefined` → 多站点栏目，
 *   表单会附站点名；其余角色锁本站）
 */
export default async function NewArticlePage() {
  const session = await auth();
  const role = session?.user.role;

  if (!role || !isRole(role) || !can(role, "article.create")) {
    notFound();
  }

  const channels = await getChannelTree({ siteId: session?.user.siteId ?? undefined });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">新建文章</h1>
        <p className="text-sm text-muted-foreground">保存为草稿；提交审核与发布属 M4（审核流）。</p>
      </div>

      {channels.ok ? (
        <ArticleForm mode="create" channelTree={channels.data} />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {channels.message}
        </p>
      )}
    </div>
  );
}
