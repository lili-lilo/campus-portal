import { AdminNavItem } from "@/components/admin/admin-nav-item";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

/**
 * 后台侧边栏 + 菜单过滤（T3.1 / docs/15 §6.1、§9.1）
 * ============================================================================
 * 过滤口径（T3.1 裁决 2）：**纯函数、零 DB**
 *   · 输入 `session.user.role`（`string`，来源 `src/types/next-auth.d.ts` 的 `Session.user.role`）
 *   · 收窄为 `Role`（`ROLE_CODES` 判定，**零 `as` 强转**）
 *   · 用 `can(role, code)` 过滤 `ADMIN_MENU` 的 13 个 `menu.*` 权限码
 *   · `super_admin` 在 `can()` 内短路（`src/lib/permissions.ts` L123-L128，依 docs/14 §2.4）
 *   · 其余角色按同文件 `ROLE_PERMISSIONS`（与 T1.5 seed 同源）
 * **不**查 `UserRole → RolePermission → Permission`（那是写操作的第 4 周 `requirePermission`；
 * 菜单可见性用纯函数即可，且可在无 DB 的单测里断言）。
 *
 * 菜单项 = **14 项**：`docs/14` §7 的全部 14 个 `menu.*`
 * —— T3.1 时按 `docs/00` §8 #26 去掉 `menu.recycle`（当时 13 项）；**M4 批次 2b 重开 #26**，
 * 加回「回收站」⇒ 恢复为 14 项。
 */

export type AdminMenuItem = {
  href: string;
  /** 中文标签（后台界面沿用既有硬编码口径，名称与 `docs/15` §9.1 的菜单列一致） */
  label: string;
  /** `docs/14` §7 的 `menu.*` 权限码 */
  code: string;
};

/** 14 项，顺序与 `docs/14` §7 的 `menu.*` 列表一致 */
export const ADMIN_MENU: readonly AdminMenuItem[] = [
  { href: "/admin/dashboard", label: "仪表盘", code: "menu.dashboard" },
  { href: "/admin/articles", label: "内容管理", code: "menu.articles" },
  { href: "/admin/channels", label: "栏目管理", code: "menu.channels" },
  { href: "/admin/media", label: "媒体库", code: "menu.media" },
  { href: "/admin/users", label: "用户管理", code: "menu.users" },
  { href: "/admin/roles", label: "角色权限", code: "menu.roles" },
  { href: "/admin/sites", label: "站点管理", code: "menu.sites" },
  { href: "/admin/audits", label: "审核待办", code: "menu.audits" },
  { href: "/admin/forms", label: "表单管理", code: "menu.forms" },
  { href: "/admin/comments", label: "评论管理", code: "menu.comments" },
  { href: "/admin/messages", label: "留言管理", code: "menu.messages" },
  { href: "/admin/statistics", label: "统计分析", code: "menu.statistics" },
  { href: "/admin/recycle", label: "回收站", code: "menu.recycle" },
  { href: "/admin/settings", label: "系统设置", code: "menu.settings" },
];

/** `string` → `Role` 的类型谓词（`ROLE_CODES` 是 4 个已知角色的唯一来源） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 按角色过滤菜单。
 * 角色缺失 / 不在 4 个已知角色内 → 返回空数组（宁可菜单为空，也不放行未知角色）。
 */
export function getAdminMenu(role: string | null | undefined): AdminMenuItem[] {
  if (!role || !isRole(role)) {
    return [];
  }
  return ADMIN_MENU.filter((item) => can(role, item.code));
}

/** 菜单链接列表（侧边栏与移动端抽屉共用，避免两处重复渲染逻辑） */
export function AdminNavList({ items }: { items: readonly AdminMenuItem[] }) {
  if (items.length === 0) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">当前角色无可见菜单。</p>;
  }

  return (
    <nav className="flex flex-col gap-1 text-sm" aria-label="后台导航">
      {items.map((item) => (
        <AdminNavItem key={item.href} href={item.href} label={item.label} />
      ))}
    </nav>
  );
}

/**
 * 桌面侧边栏（`md` 及以上显示；小屏改走 `AdminMobileNav` 的抽屉）。
 * 当前页高亮由 `AdminNavItem`（`'use client'` + `usePathname()`）负责 —— T3.3 已落地。
 */
export function AdminSidebar({ items }: { items: readonly AdminMenuItem[] }) {
  return (
    <aside className="hidden w-56 shrink-0 border-r border-border/60 p-3 md:block">
      <AdminNavList items={items} />
    </aside>
  );
}
