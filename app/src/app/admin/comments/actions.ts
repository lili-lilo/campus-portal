"use server";

import { revalidatePath } from "next/cache";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  emptyPage,
  fail,
  parsePositiveInt,
  requireSession,
  type Fail,
  type Ok,
  type Paginated,
  type SessionContext,
} from "@/lib/actions-shared";
import { can, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * 评论后台（M5-4a / `docs/14` §5.4 **L400-L416**、`docs/15` §9.1 **L433**）
 * ============================================================================
 * 5 个 Action 与契约逐条对应（权限列全是 `comment.manage`）：
 *   · `listComments({ status?, articleId?, page?, pageSize? })` —— L408（`siteId` 由数据范围推导，不由客户端传）
 *   · `approveComment({ id })` —— L409
 *   · `rejectComment({ id })`  —— L410
 *   · `replyComment({ id, content })` —— L411（**父必须顶级**）
 *   · `deleteComment({ id })` —— L412（软删 + **级联软删回复**）
 *
 * 鉴权：**每个 Action 都 L1 + L2**
 *   · L1 `requireSession()`（会话 + 角色收窄，来自 `@/lib/actions-shared`）
 *   · L2 `can(role, "comment.manage")`（只有 `auditor` / `site_admin` / `super_admin` 持有；
 *     实测 `permissions.ts` L87-L100 editor 12 条不含、L103-L114 auditor 10 条含、其余全含）
 *   · 数据范围（L3）：`super_admin` 全站 / 其余**强制锁 `session.siteId`**
 *
 * 审批语义（**M5-4a 裁决 ③：宽松可纠错**）：三态之间**任意互转**
 *   —— 契约 L409/L410 写的是主路径（`pending → approved` / `pending → rejected`），
 *   但后台是管理台，允许"误驳改通过""撤回通过"更实用；**状态值本身仍走白名单**。
 *
 * ⚠ 本文件是 `"use server"` 文件：**只能导出 async 函数**（导出运行时常量会在 build 时报
 *   `A "use server" file can only export async functions, found object` —— M5-5a 实测踩到）
 *   ⇒ `COMMENT_STATUSES` 模块内私有；**类型导出不受限**（编译期擦除）。
 * ⚠ **不写 `AuditRecord`**：`docs/13` §7.2 的六态机只覆盖 `Article`；评论三态是独立字段。
 */

/** 评论三态（schema.prisma L343-L344；**不导出**，见文件头 ⚠） */
const COMMENT_STATUSES = ["pending", "approved", "rejected"] as const;

type CommentStatus = (typeof COMMENT_STATUSES)[number];

function isCommentStatus(value: unknown): value is CommentStatus {
  return typeof value === "string" && (COMMENT_STATUSES as readonly string[]).includes(value);
}

/** 列表一行（平铺：顶级与回复同样是行；`parent` 仅回复行非空，供"↳ 回复给 X"展示） */
export type CommentItem = {
  id: string;
  name: string;
  email: string | null;
  content: string;
  status: string;
  ip: string | null;
  createdAt: Date;
  parentId: string | null;
  article: { id: string; title: string; slug: string };
  parent: { id: string; name: string } | null;
};

/** 入参 `siteId` 解析：`super_admin` 全站（本域契约无 `siteId` 入参，故不接受收窄）；其余锁本站 */
function scopeSiteIdOf(session: SessionContext): string | null {
  return isSuperAdmin(session.role) ? null : session.siteId;
}

/**
 * 评论列表（`docs/14` L408）。**平铺**返回顶级与回复（M5-4a 裁决 ①）：
 * `status` 过滤覆盖**所有层级** ⇒ 待审回复不会被藏在其它状态的父评论下而漏审。
 */
export async function listComments(input: {
  status?: string;
  articleId?: string;
  page?: string;
  pageSize?: string;
}): Promise<Ok<Paginated<CommentItem>> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "comment.manage")) {
    return fail("FORBIDDEN", "无权查看评论。");
  }

  const page = parsePositiveInt(input.page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
  const pageSize = parsePositiveInt(input.pageSize, {
    min: 1,
    max: MAX_PAGE_SIZE,
    fallback: DEFAULT_PAGE_SIZE,
  });

  const siteId = scopeSiteIdOf(session);
  if (!isSuperAdmin(session.role) && !siteId) {
    return { ok: true, data: emptyPage<CommentItem>(page, pageSize) };
  }

  const articleId = input.articleId?.trim() || undefined;
  const status = input.status && isCommentStatus(input.status) ? input.status : undefined;

  const where = {
    deletedAt: null,
    ...(siteId ? { siteId } : {}),
    ...(articleId ? { articleId } : {}),
    ...(status ? { status } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        content: true,
        status: true,
        ip: true,
        createdAt: true,
        parentId: true,
        article: { select: { id: true, title: true, slug: true } },
        parent: { select: { id: true, name: true } },
      },
    }),
    prisma.comment.count({ where }),
  ]);

  return {
    ok: true,
    data: {
      items: rows,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: page * pageSize < total,
    },
  };
}

/** 取一条未删除的评论（`approve` / `reject` / `reply` / `delete` 共用） */
async function findLiveComment(id: string) {
  return prisma.comment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, siteId: true, articleId: true, parentId: true },
  });
}

/** L3 数据范围：本站角色只能动本站评论 */
function outOfScope(session: SessionContext, commentSiteId: string): boolean {
  return !isSuperAdmin(session.role) && commentSiteId !== session.siteId;
}

/**
 * 通过（`docs/14` L409）。
 * **宽松语义（裁决 ③）**：任意三态都可改为 `approved`（可纠正误驳回 / 撤回通过）。
 */
export async function approveComment(input: { id: string }): Promise<Ok<{ id: string }> | Fail> {
  return setCommentStatus(input.id, "approved");
}

/** 驳回（`docs/14` L410）；语义同 `approveComment`（宽松可纠错） */
export async function rejectComment(input: { id: string }): Promise<Ok<{ id: string }> | Fail> {
  return setCommentStatus(input.id, "rejected");
}

async function setCommentStatus(
  id: string,
  status: CommentStatus,
): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "comment.manage")) {
    return fail("FORBIDDEN", "无权处理评论。");
  }

  const comment = await findLiveComment(id);
  if (!comment) {
    return fail("NOT_FOUND", "评论不存在或已删除。");
  }
  if (outOfScope(session, comment.siteId)) {
    return fail("FORBIDDEN", "无权处理该评论。");
  }

  await prisma.comment.update({ where: { id: comment.id }, data: { status } });
  revalidatePath("/admin/comments");

  return { ok: true, data: { id: comment.id } };
}

/**
 * 管理员回复（`docs/14` L411）。
 * · **两级限制**：目标评论必须是**顶级**（`parentId === null`），否则 `VALIDATION_FAILED`(400)
 *   —— 这是真正的边界（UI 只在顶级行给「回复」入口，见 `comment-list.tsx`）
 * · 落库（裁决 ⑤）：`siteId`/`articleId` **继承父**，`parentId` = 目标 id，
 *   `name` = `session.userLabel`（管理员名），`status = "approved"`（管理员回复免审，与 seed 的 8 条回复同口径），
 *   `email`/`ip` 留空（非公网来源）
 */
export async function replyComment(input: {
  id: string;
  content: string;
}): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "comment.manage")) {
    return fail("FORBIDDEN", "无权回复评论。");
  }

  const content = input.content?.trim() ?? "";
  if (content.length === 0) {
    return fail("VALIDATION_FAILED", "回复内容不能为空。", "content");
  }

  const target = await findLiveComment(input.id);
  if (!target) {
    return fail("NOT_FOUND", "评论不存在或已删除。");
  }
  if (outOfScope(session, target.siteId)) {
    return fail("FORBIDDEN", "无权回复该评论。");
  }
  if (target.parentId !== null) {
    return fail("VALIDATION_FAILED", "只支持两级评论：不能回复回复。", "id");
  }

  const created = await prisma.comment.create({
    data: {
      siteId: target.siteId,
      articleId: target.articleId,
      parentId: target.id,
      name: session.userLabel,
      email: null,
      content,
      status: "approved",
      ip: null,
    },
    select: { id: true },
  });

  revalidatePath("/admin/comments");

  return { ok: true, data: { id: created.id } };
}

/**
 * 删除（`docs/14` L412）：**软删 + 级联软删回复** —— 一次 `updateMany`
 * （`OR: [{ id }, { parentId: id }]`）同时命中自己与其回复；删回复时只影响它自己。
 */
export async function deleteComment(input: { id: string }): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "comment.manage")) {
    return fail("FORBIDDEN", "无权删除评论。");
  }

  const comment = await findLiveComment(input.id);
  if (!comment) {
    return fail("NOT_FOUND", "评论不存在或已删除。");
  }
  if (outOfScope(session, comment.siteId)) {
    return fail("FORBIDDEN", "无权删除该评论。");
  }

  // 一次 updateMany 同时软删"自己 + 其回复"（删回复时只影响它自己）
  await prisma.comment.updateMany({
    where: { OR: [{ id: comment.id }, { parentId: comment.id }] },
    data: { deletedAt: new Date() },
  });

  revalidatePath("/admin/comments");

  return { ok: true, data: { id: comment.id } };
}
