"use server";

import { auth } from "@/lib/auth";
import { ROLE_CODES, can, isSuperAdmin, type Role } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * 栏目管理 Server Action（T3.7 / docs/15 §9.1 L425、docs/14 §5.3 L345）
 * ============================================================================
 * 返回信封遵 docs/14 §2.1：`Ok<T> = { ok: true; data: T }` / `Fail = { ok: false; code; message }`。
 *
 * 鉴权（T3.7 裁决 Q4，**两层**）：
 *   · L1 `await auth()` —— 未登录 → `UNAUTHORIZED`
 *   · L2 `can(role, "channel.read")`（`src/lib/permissions.ts` L123-L128）—— 无权限 → `FORBIDDEN`
 *     ⇒ `site_admin` / `super_admin` 通过；**`editor` / `auditor` 没有 `channel.read`**（permissions.ts
 *     L80-L92 / L95-L106 原文），按规格保持不变、**不补权限码**。
 *   · 注意：文章表单用的 `getChannelTree`（`articles/actions.ts`）**故意不加 L2** —— 它要被 `editor`
 *     调用；两者职责不同，故本文件独立存在（T3.7 裁决 Q3）。
 *
 * 数据范围：`super_admin` → `input.siteId ?? null`（null = 全部站点）；其余角色**强制锁** `session.user.siteId`。
 *
 * 与 `getChannelTree` 的三点区别（T3.7 探路报告的"复用三处损失"）：
 *   ① 含**全部 4 种 type**（list / page / link / form）；② 含**停用**栏目（`status = false`）；
 *   ③ 返回 **`parentId`**（调用方自行组树）。不做分页（栏目量小）。
 */

export type ChannelErrorCode = "UNAUTHORIZED" | "FORBIDDEN" | "INTERNAL_ERROR";

export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; code: ChannelErrorCode; message: string };

/** 一行栏目（扁平；`parentId` 交给调用方组树） */
export type ChannelRow = {
  id: string;
  parentId: string | null;
  name: string;
  /** 英文名（M5-1 / docs/00 §8 #58）；后台只读展示用，空值显示「—」 */
  nameEn: string | null;
  slug: string;
  /** `list` / `page` / `link` / `form`（schema.prisma L65-L66） */
  type: string;
  status: boolean;
  sort: number;
  /** 站点名：super_admin 会拿到多站点栏目，前端据此决定是否展示 */
  siteName: string;
};

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

export async function listChannels(
  input: { siteId?: string } = {},
): Promise<Ok<ChannelRow[]> | Fail> {
  const session = await auth();

  if (!session) {
    return { ok: false, code: "UNAUTHORIZED", message: "会话已过期，请重新登录。" };
  }

  if (!isRole(session.user.role)) {
    return { ok: false, code: "FORBIDDEN", message: "当前账号角色不可用，请联系管理员。" };
  }

  const role: Role = session.user.role;

  // L2（docs/14 §5.3 L345）：栏目读取权限
  if (!can(role, "channel.read")) {
    return { ok: false, code: "FORBIDDEN", message: "无权访问栏目数据。" };
  }

  const siteId = isSuperAdmin(role) ? (input.siteId ?? null) : session.user.siteId;

  // 非 super_admin 却没有站点（seed 不会出现）→ 返回空列表，宁可空也不越权
  if (!isSuperAdmin(role) && !siteId) {
    return { ok: true, data: [] };
  }

  const rows = await prisma.channel.findMany({
    // 含停用、含全部 type（与 getChannelTree 的 `type: "list"` + `status: true` 刻意不同）
    where: siteId ? { siteId } : {},
    orderBy: [{ sort: "asc" }, { name: "asc" }],
    select: {
      id: true,
      parentId: true,
      name: true,
      nameEn: true,
      slug: true,
      type: true,
      status: true,
      sort: true,
      site: { select: { name: true } },
    },
  });

  return {
    ok: true,
    data: rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      nameEn: row.nameEn,
      slug: row.slug,
      type: row.type,
      status: row.status,
      sort: row.sort,
      siteName: row.site.name,
    })),
  };
}
