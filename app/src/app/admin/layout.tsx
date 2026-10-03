import type { ReactNode } from "react";

import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { AdminSidebar, getAdminMenu } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { auth } from "@/lib/auth";

/**
 * 后台布局（改造自 T1.6 骨架，T3.1 / docs/15 §6.1、§9.1）
 * ============================================================================
 * 会话校验（T3.1 裁决 1）：
 *   · `await auth()` 取会话（L1 认证）。
 *   · **未登录 → 只渲染 children**（保留 T1.6 的约定：`/admin/login` 自己占满屏）。
 *     本布局**不重定向** —— 重定向由 `src/proxy.ts` 负责（在本布局重定向会把
 *     `/admin/login` 套进死循环）。
 *   · `src/proxy.ts` 完全不动（docs/15 §5.3：拦截层只做 cookie 存在性的乐观校验）。
 *
 * 权限过滤（T3.1 裁决 2）：`getAdminMenu(role)` 走 `src/lib/permissions.ts` 的纯函数，
 *   零 DB、可在无数据库的单测里断言。**L2 的 DB 版矩阵（UserRole→RolePermission）与
 *   L3 数据范围属第 4 周 `requirePermission` 的事**，不在本文件。
 *
 * 未做（明确留待后续）：
 *   · 「当前页高亮」—— Next 16 布局内无稳定的 pathname API；
 *   · 会话过期后的二次跳转 —— 真校验点在每个 Server Action（docs/15 §5.3）。
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session) {
    return <>{children}</>;
  }

  const menu = getAdminMenu(session.user.role);

  return (
    <div className="flex min-h-full flex-col">
      <AdminTopbar name={session.user.name ?? session.user.id} role={session.user.role} />

      <AdminMobileNav items={menu} />

      <div className="flex flex-1">
        <AdminSidebar items={menu} />

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
