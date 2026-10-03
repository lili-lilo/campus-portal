import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RecycleTable } from "@/components/admin/recycle-table";
import { auth } from "@/lib/auth";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

import { listRecycleBin } from "./actions";

export const metadata: Metadata = { title: "回收站" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx`） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 回收站（M4 批次 2b）—— `docs/15` §9.1 的 `/admin/recycle` 行；`docs/16` §2.4 四步的 UI 侧
 *
 * · 页面 gate 用 **`article.delete`**（与 `listRecycleBin` / `restoreFromRecycle` / `purgeFromRecycle`
 *   内的 L2 同码，符合 `docs/14` §5.14 L562「各实体对应 `.delete` 权限」）；
 *   导航可见性由 `menu.recycle` 控制（`admin-sidebar.tsx` 的 `ADMIN_MENU`），二者刻意分开
 * · 不通过 → `notFound()`（不泄露存在性）
 * · M4 只做 `Article`（`docs/16` §2.4 的范围注）
 */
export default async function RecyclePage() {
  const session = await auth();
  const role = session?.user.role;

  if (!role || !isRole(role) || !can(role, "article.delete")) {
    notFound();
  }

  const result = await listRecycleBin({
    entity: "article",
    siteId: session?.user.siteId ?? undefined,
  });

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">回收站</h1>
        <p role="alert" className={ALERT_CLASS}>
          {result.message}
        </p>
      </div>
    );
  }

  const { items, total } = result.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">回收站</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 篇已删除文章（可恢复；「彻底删除」不可撤销）。
          {role === "editor" ? "仅显示本人稿件。" : ""}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          回收站是空的
        </div>
      ) : (
        <RecycleTable items={items} />
      )}
    </div>
  );
}
