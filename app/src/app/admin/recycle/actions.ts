"use server";

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
} from "@/lib/actions-shared";
import { can, inScope, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * 回收站 Server Action（M4 批次 2a / `docs/14` §5.14 L556-L565、`docs/16` §2.4）
 * ============================================================================
 * · **M4 只做 `Article`**：`RecycleEntity` 目前只含 `"article"`（扩展位见该类型注释）
 * · 三个 Action 的权限统一用 **`article.delete`**（`docs/14` §5.14 L562「各实体对应 `.delete` 权限」）
 *   —— `editor` 也有该码（`permissions.ts` L41 + L87）⇒ 可删/恢复/彻底删**本人**稿件，C4 由 `inScope` 收
 * · 本文件自备 `requireSession` / `fail` / 分页小工具：它们在 `articles/actions.ts` 里是
 *   **私有**的（`channels/actions.ts` 已有同款先例），避免为复用而把它们导出成公共 API
 * · 软删除**不写 `AuditRecord`**（C1 只管"状态变更"），恢复也同理（`docs/16` §2.4 L174）
 */

/** M4 只支持文章；将来扩 `page` / `media` / `comment` / `attachment` 时在此加值（`docs/14` §5.14 L562） */
export type RecycleEntity = "article";

/** 回收站一行的展示字段（查询已过滤 `deletedAt != null`，但 Prisma 类型仍可空，故保留 `| null`） */
export type RecycleItem = {
  id: string;
  title: string;
  channelName: string;
  deletedAt: Date | null;
  createdByName: string | null;
};

// `SessionContext` / `SessionResult` / `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` / `fail` /
// `isRole` / `requireSession` / `parsePositiveInt` / `emptyPage` 已上移到 `@/lib/actions-shared`
// （T3.6a：本文件 + `articles/actions.ts` + 上传 Route Handler 三处共用）

/** 只接受 `"article"`；将来扩展实体时改这里（入参来自 URL，故按 `unknown` 收） */
function normalizeEntity(value: unknown): RecycleEntity | null {
  if (value === undefined || value === "article") {
    return "article";
  }
  return null;
}

/**
 * 回收站列表（`docs/14` §5.14 L562）。L1 + **L2 `article.delete`** + 数据范围 + **C4**。
 *
 * · `where` = `deletedAt != null`（+ 站点）
 * · **C4**：`data.own_only` 的角色（`editor`）只看得到**本人**稿件 —— 直接收进 `where`，
 *   这样 `total` 与 `items` 一致（分页不会错位），而不是取回后再 filter
 * · `orderBy` = `deletedAt desc`（最近删除的在最前）
 */
export async function listRecycleBin(
  input: {
    entity?: unknown;
    siteId?: string;
    page?: string;
    pageSize?: string;
  } = {},
): Promise<Ok<Paginated<RecycleItem>> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  // L2
  if (!can(session.role, "article.delete")) {
    return fail("FORBIDDEN", "无权访问回收站。");
  }

  const entity = normalizeEntity(input.entity);
  if (entity === null) {
    return fail("VALIDATION_FAILED", "本版本回收站只支持 article。");
  }

  const page = parsePositiveInt(input.page, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    fallback: 1,
  });
  const pageSize = parsePositiveInt(input.pageSize, {
    min: 1,
    max: MAX_PAGE_SIZE,
    fallback: DEFAULT_PAGE_SIZE,
  });

  const siteId = isSuperAdmin(session.role) ? (input.siteId ?? null) : session.siteId;
  if (!isSuperAdmin(session.role) && !siteId) {
    return { ok: true, data: emptyPage<RecycleItem>(page, pageSize) };
  }

  const ownOnly = can(session.role, "data.own_only");
  const where = {
    deletedAt: { not: null },
    ...(siteId ? { siteId } : {}),
    ...(ownOnly ? { createdById: session.userId } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.article.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        deletedAt: true,
        channel: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.article.count({ where }),
  ]);

  const items: RecycleItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    channelName: row.channel.name,
    deletedAt: row.deletedAt,
    createdByName: row.createdBy?.name ?? null,
  }));

  return {
    ok: true,
    data: {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: page * pageSize < total,
    },
  };
}

/**
 * 从回收站恢复（`docs/14` §5.14 L563）。L1 + L2 `article.delete` + C4。
 *
 * · 目标必须**在回收站中**（`deletedAt != null`），否则 `NOT_FOUND`
 * · 只把 `deletedAt` 置空：**状态不变** ⇒ 恢复后仍是删除前那个（`docs/16` §2.4 L174）
 * · 不写 `AuditRecord`（不改 `status`，C1 不适用）
 */
export async function restoreFromRecycle(input: {
  entity?: unknown;
  id: string;
}): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  if (!can(session.role, "article.delete")) {
    return fail("FORBIDDEN", "无权恢复文章。");
  }

  if (normalizeEntity(input.entity) === null) {
    return fail("VALIDATION_FAILED", "本版本回收站只支持 article。");
  }

  const article = await prisma.article.findFirst({
    where: { id: input.id },
    select: { id: true, siteId: true, createdById: true, deletedAt: true },
  });
  if (!article) {
    return fail("NOT_FOUND", "文章不存在或已删除。");
  }

  // C4 / L3
  const scopeError = inScope(
    session.role,
    session.siteId,
    { siteId: article.siteId, createdById: article.createdById },
    session.userId,
  );
  if (scopeError) {
    return fail("FORBIDDEN", "无权恢复该文章。");
  }

  if (article.deletedAt === null) {
    return fail("NOT_FOUND", "该文章不在回收站中。");
  }

  await prisma.article.update({
    where: { id: article.id },
    data: { deletedAt: null },
  });

  return { ok: true, data: { id: article.id } };
}

/**
 * 彻底删除（`docs/14` §5.14 L564）—— **物理删除，不可恢复**。L1 + L2 `article.delete` + C4。
 *
 * · 目标必须**在回收站中**（先软删再彻底删），否则 `NOT_FOUND`
 * · 关联行按 `onDelete` 级联：`Attachment.article` → **Cascade**（`schema.prisma` L312）、
 *   `Comment.article` → Cascade（L343）（`docs/16` §2.4 L175）
 */
export async function purgeFromRecycle(input: {
  entity?: unknown;
  id: string;
}): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  if (!can(session.role, "article.delete")) {
    return fail("FORBIDDEN", "无权彻底删除文章。");
  }

  if (normalizeEntity(input.entity) === null) {
    return fail("VALIDATION_FAILED", "本版本回收站只支持 article。");
  }

  const article = await prisma.article.findFirst({
    where: { id: input.id },
    select: { id: true, siteId: true, createdById: true, deletedAt: true },
  });
  if (!article) {
    return fail("NOT_FOUND", "文章不存在或已删除。");
  }

  // C4 / L3
  const scopeError = inScope(
    session.role,
    session.siteId,
    { siteId: article.siteId, createdById: article.createdById },
    session.userId,
  );
  if (scopeError) {
    return fail("FORBIDDEN", "无权彻底删除该文章。");
  }

  if (article.deletedAt === null) {
    return fail("NOT_FOUND", "该文章不在回收站中（需先软删除）。");
  }

  await prisma.article.delete({ where: { id: article.id } });

  return { ok: true, data: { id: article.id } };
}
