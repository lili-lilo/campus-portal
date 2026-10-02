import { describe, expect, it } from "vitest";

import {
  can,
  inScope,
  isSuperAdmin,
  PERMISSION_CODES,
  ROLE_CODES,
  ROLE_PERMISSIONS,
  type Role,
} from "@/lib/permissions";

/**
 * 权限判定单测（docs/16 §2.3 允许矩阵 + 越权拒绝；docs/14 §2.4 的 L2/L3）
 */
describe("permissions：docs/16 §2.3 允许矩阵", () => {
  const matrix: Array<[string, Role, boolean, string]> = [
    ["article.create", "super_admin", true, "超级管理员全通"],
    ["article.create", "site_admin", true, "本站管理员可建稿"],
    ["article.create", "editor", true, "编辑可建稿"],
    ["article.create", "auditor", false, "审核员**不可**建稿"],
    ["article.update", "super_admin", true, ""],
    ["article.update", "site_admin", true, ""],
    ["article.update", "editor", true, "（本人，由 L3 收窄）"],
    ["article.update", "auditor", false, ""],
    ["article.audit", "super_admin", true, ""],
    ["article.audit", "site_admin", true, ""],
    ["article.audit", "editor", false, "编辑**不可**审核"],
    ["article.audit", "auditor", true, ""],
    ["article.publish", "editor", false, "编辑**不可**发布"],
    ["article.publish", "auditor", true, ""],
    ["article.withdraw", "editor", false, "编辑**不可**撤稿"],
    ["article.withdraw", "auditor", true, ""],
    ["role.manage", "super_admin", true, ""],
    ["role.manage", "site_admin", false, "docs/16 §2.3：仅超级管理员"],
    ["role.manage", "editor", false, ""],
    ["role.manage", "auditor", false, ""],
    ["user.manage", "super_admin", true, ""],
    ["user.manage", "site_admin", false, "docs/16 §2.3：仅超级管理员"],
  ];

  it.each(matrix)("can(%s, %s) === %s %s", (code, role, expected) => {
    expect(can(role, code)).toBe(expected);
  });

  it("权限码总数 = 45（14 menu + 28 action + 3 data）且四角色齐全", () => {
    expect(PERMISSION_CODES).toHaveLength(45);
    expect(ROLE_CODES).toHaveLength(4);
  });

  it("角色权限条数：super 45 / site_admin 41 / editor 11 / auditor 10", () => {
    expect(ROLE_PERMISSIONS.super_admin).toHaveLength(45);
    // ⚠ 与 T1.5 seed 的差异：seed 给 site_admin 授了全部 28 个 action（共 43 条），
    //   本文件按 docs/16 §2.3 排除 role.manage / user.manage → 41 条。
    expect(ROLE_PERMISSIONS.site_admin).toHaveLength(41);
    expect(ROLE_PERMISSIONS.editor).toHaveLength(11);
    expect(ROLE_PERMISSIONS.auditor).toHaveLength(10);
  });

  it("isSuperAdmin 只认 super_admin", () => {
    expect(isSuperAdmin("super_admin")).toBe(true);
    expect(isSuperAdmin("site_admin")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });
});

describe("permissions：L3 数据范围（docs/14 §2.4）", () => {
  const mainArticle = { siteId: "site-main", createdById: "user-editor" };

  it("super_admin（siteId=null）全站放行", () => {
    expect(inScope("super_admin", null, mainArticle, "anyone")).toBeNull();
    expect(inScope("super_admin", null, { siteId: "site-cs", createdById: null }, null)).toBeNull();
  });

  it("site_admin 只能操作本站记录（跨站点 → FORBIDDEN）", () => {
    expect(inScope("site_admin", "site-main", mainArticle, "user-x")).toBeNull();
    expect(inScope("site_admin", "site-main", { siteId: "site-cs", createdById: null }, "x")).toBe(
      "FORBIDDEN",
    );
  });

  it("editor 额外受 C4 约束：仅本人稿件", () => {
    expect(inScope("editor", "site-main", mainArticle, "user-editor")).toBeNull();
    expect(inScope("editor", "site-main", mainArticle, "user-other")).toBe("FORBIDDEN");
  });

  it("无 session.siteId 的非超管一律拒绝", () => {
    expect(inScope("site_admin", null, mainArticle, "user-x")).toBe("FORBIDDEN");
    expect(inScope("editor", null, mainArticle, "user-editor")).toBe("FORBIDDEN");
    expect(inScope("auditor", null, mainArticle, "user-x")).toBe("FORBIDDEN");
  });
});
