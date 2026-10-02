/**
 * 权限判定 —— **纯函数**实现（无 Prisma 依赖，供 L1 单测在无数据库环境下运行）
 *
 * 规格来源：
 *   · docs/14 §7 权限码清单（14 menu + 28 action + 3 data = 45）
 *   · docs/14 §7 四角色矩阵 + §2.4 三层鉴权（L2 权限码 / L3 数据范围）
 *   · docs/16 §2.3 「允许矩阵（单元测试断言）」
 *
 * ⚠ 与 T1.5 seed 的一处已知差异（已登记待裁决）：
 *   `docs/16` §2.3 规定 `role.manage` / `user.manage` **仅** `super_admin` 可用，
 *   而 T1.5 的 `seedRolePermissions()` 给 `site_admin` 授了**全部 28 个 action**（含这两个）。
 *   本文件按 **docs/16 §2.3**（T1.9 的测试规格）实现 → `site_admin` = 41 条（43 − 2）。
 */

export const ROLE_CODES = ["super_admin", "site_admin", "editor", "auditor"] as const;
export type Role = (typeof ROLE_CODES)[number];

/** 14 个菜单权限（docs/14 §7） */
export const MENU_PERMISSIONS = [
  "menu.dashboard",
  "menu.articles",
  "menu.channels",
  "menu.media",
  "menu.users",
  "menu.roles",
  "menu.sites",
  "menu.audits",
  "menu.forms",
  "menu.comments",
  "menu.messages",
  "menu.statistics",
  "menu.settings",
  "menu.recycle",
] as const;

/** 28 个动作权限（docs/14 §7） */
export const ACTION_PERMISSIONS = [
  "article.read",
  "article.create",
  "article.update",
  "article.delete",
  "article.submit",
  "article.audit",
  "article.publish",
  "article.withdraw",
  "page.read",
  "page.manage",
  "channel.read",
  "channel.manage",
  "media.read",
  "media.upload",
  "media.manage",
  "comment.manage",
  "message.manage",
  "form.manage",
  "user.read",
  "user.manage",
  "role.read",
  "role.manage",
  "site.read",
  "site.manage",
  "statistics.read",
  "config.manage",
  "log.read",
  "log.write",
] as const;

/** 3 个数据范围权限（docs/14 §7） */
export const DATA_PERMISSIONS = ["data.site_scoped", "data.own_only", "data.global"] as const;

export const PERMISSION_CODES = [
  ...MENU_PERMISSIONS,
  ...ACTION_PERMISSIONS,
  ...DATA_PERMISSIONS,
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

/** `editor` 的 11 条（与 T1.5 seed 一致） */
const EDITOR_PERMISSIONS = [
  "menu.dashboard",
  "menu.articles",
  "menu.media",
  "article.read",
  "article.create",
  "article.update",
  "article.delete",
  "article.submit",
  "media.read",
  "media.upload",
  "data.own_only",
] as const;

/** `auditor` 的 10 条（与 T1.5 seed 一致） */
const AUDITOR_PERMISSIONS = [
  "menu.dashboard",
  "menu.audits",
  "menu.comments",
  "article.read",
  "article.audit",
  "article.publish",
  "article.withdraw",
  "comment.manage",
  "message.manage",
  "data.site_scoped",
] as const;

/** `super_admin` 之外，`site_admin` 被排除的 4 条（docs/16 §2.3 + 数据范围只有一种） */
const SITE_ADMIN_EXCLUDED = ["role.manage", "user.manage", "data.global", "data.own_only"] as const;

const SITE_ADMIN_PERMISSIONS = PERMISSION_CODES.filter(
  (code) => !(SITE_ADMIN_EXCLUDED as readonly string[]).includes(code),
);

export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  super_admin: PERMISSION_CODES,
  site_admin: SITE_ADMIN_PERMISSIONS,
  editor: EDITOR_PERMISSIONS,
  auditor: AUDITOR_PERMISSIONS,
};

/** L2：该角色是否拥有该权限码（`super_admin` 天然全通） */
export function can(role: Role, code: PermissionCode | string): boolean {
  if (role === "super_admin") {
    return (PERMISSION_CODES as readonly string[]).includes(code);
  }
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(code);
}

export function isSuperAdmin(role: Role | string | null | undefined): boolean {
  return role === "super_admin";
}

export type DataScopeTarget = {
  siteId: string | null;
  /** 稿件归属人（约束 C4；非 Article 资源传 null） */
  createdById: string | null;
};

export type ScopeErrorCode = "FORBIDDEN";

/**
 * L3 数据范围（docs/14 §2.4）：
 *   · `super_admin`（`session.siteId = null`）→ 全站
 *   · 其余角色：目标 `siteId` 必须等于自身站点
 *   · `editor` 另需 `createdById === userId`（约束 C4）
 */
export function inScope(
  role: Role,
  sessionSiteId: string | null,
  target: DataScopeTarget,
  userId: string | null,
): ScopeErrorCode | null {
  if (role === "super_admin") {
    return null;
  }

  if (!sessionSiteId || target.siteId !== sessionSiteId) {
    return "FORBIDDEN";
  }

  if (role === "editor" && target.createdById !== userId) {
    return "FORBIDDEN";
  }

  return null;
}
