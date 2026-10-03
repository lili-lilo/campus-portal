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
 * 媒体 Server Action（T3.6a）—— `docs/14` §5.3 L372-L376 / `docs/15` §9.1 L427
 * ============================================================================
 * 本批只做 **`listMedia`（读）+ `deleteMedia`（软删）**：
 *   · `updateMedia`（改名/分类）/ `bulkDeleteMedia` / `listAlbums`（相册维度）留 M5
 *   · **上传**不走 Server Action（非 JSON 的 multipart 必须走 Route Handler，
 *     `docs/14` §2.1 L50）⇒ 见 `app/src/app/api/media/upload/route.ts`
 *
 * 权限：读 `media.read`（`editor` 有）；软删 `media.manage`（只有 `site_admin` / `super_admin`）
 * ⇒ 页面上"删除"按钮对 `editor` 隐藏，但真正的边界仍是本文件的 L2。
 */

export type MediaItem = {
  id: string;
  name: string;
  path: string;
  size: number;
  mimeType: string | null;
  type: string;
  folder: string | null;
  uploader: string;
  createdAt: Date;
};

export type ListMediaInput = {
  siteId?: string;
  /** `news` / `carousel` / `dept` / `leader` / `other` */
  folder?: string;
  /** `image` / `video` / `file` */
  type?: string;
  keyword?: string;
  page?: string;
  pageSize?: string;
};

/** 列表（`docs/14` §5.3 L372）。L1 + **L2 `media.read`** + 数据范围（`Media.siteId` 空 = 全站共享）。 */
export async function listMedia(
  input: ListMediaInput = {},
): Promise<Ok<Paginated<MediaItem>> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  // L2
  if (!can(session.role, "media.read")) {
    return fail("FORBIDDEN", "无权查看媒体库。");
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
    return { ok: true, data: emptyPage<MediaItem>(page, pageSize) };
  }

  const keyword = input.keyword?.trim();
  const where = {
    deletedAt: null,
    // 站点范围：本站媒体 + 全站共享（`siteId = null`，schema.prisma L262-L263）
    ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
    ...(input.folder ? { folder: input.folder } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(keyword ? { name: { contains: keyword } } : {}),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        path: true,
        size: true,
        mimeType: true,
        type: true,
        folder: true,
        uploader: true,
        createdAt: true,
      },
    }),
    prisma.media.count({ where }),
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

/**
 * 软删除媒体（`docs/14` §5.3 L375）。L1 + **L2 `media.manage`** + C4/L3 `inScope`。
 *
 * · 只置 `deletedAt`，**不写 `AuditRecord`**（与回收站口径一致：C1 只管"状态变更"，媒体无状态机）
 * · **不删物理文件**（保留在 `public/uploads/`，防误删；彻底清理留给 M5 的回收站扩展）
 * · 已在回收站中 → `SOFT_DELETED`
 * · 全站共享素材（`siteId = null`）：按"当前站点"判范围（`siteId ?? session.siteId`），
 *   否则 `site_admin` 会因 `inScope` 的站点比对失败而永远删不掉共享素材
 */
export async function deleteMedia(input: { id: string }): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  // L2：`media.manage`（editor 没有 ⇒ 界面隐藏 + 这里拦截）
  if (!can(session.role, "media.manage")) {
    return fail("FORBIDDEN", "无权删除媒体。");
  }

  const media = await prisma.media.findFirst({
    where: { id: input.id },
    select: { id: true, siteId: true, uploaderId: true, deletedAt: true },
  });
  if (!media) {
    return fail("NOT_FOUND", "素材不存在或已删除。");
  }

  // C4 / L3
  const scopeError = inScope(
    session.role,
    session.siteId,
    { siteId: media.siteId ?? session.siteId, createdById: media.uploaderId },
    session.userId,
  );
  if (scopeError) {
    return fail("FORBIDDEN", "无权删除该素材。");
  }

  if (media.deletedAt !== null) {
    return fail("SOFT_DELETED", "该素材已在回收站中。");
  }

  await prisma.media.update({
    where: { id: media.id },
    data: { deletedAt: new Date() },
  });

  return { ok: true, data: { id: media.id } };
}
