import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";

/**
 * 后台顶栏（T3.1 裁决 3）
 * ============================================================================
 * · 展示：用户名 + role 中文标签 + 退出按钮
 * · 退出走 **Server Action**（本文件的 `logoutAction`，内联 `"use server"`）：
 *   `signOut({ redirectTo })` 默认 `redirect: true`，内部抛 `NEXT_REDIRECT`
 *   （类型依据 `next-auth/index.d.ts` L287-L292）
 * · 本组件保持 **Server Component**（无 `'use client'`）：`<form action={...}>` 即可
 */

const ROLE_LABELS = new Map<string, string>([
  ["super_admin", "超级管理员"],
  ["site_admin", "站点管理员"],
  ["editor", "编辑"],
  ["auditor", "审核员"],
]);

async function logoutAction() {
  "use server";

  await signOut({ redirectTo: "/admin/login" });
}

export function AdminTopbar({ name, role }: { name: string; role: string }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border/60 px-4 py-3">
      <span className="text-sm font-semibold">XX大学站群 · 后台</span>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {name} · {ROLE_LABELS.get(role) ?? role}
        </span>

        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">
            退出登录
          </Button>
        </form>
      </div>
    </header>
  );
}
