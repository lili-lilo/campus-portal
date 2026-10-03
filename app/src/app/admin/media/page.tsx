import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MediaTable } from "@/components/admin/media-table";
import { MediaUploader } from "@/components/admin/media-uploader";
import { auth } from "@/lib/auth";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

import { listMedia } from "./actions";

export const metadata: Metadata = { title: "媒体库" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx`） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 媒体库（T3.6b）—— `docs/15` §9.1 的 `/admin/media` 行（`menu.media`）
 *
 * · 页面 gate = **`menu.media`**（与 `docs/14` §3 L200 的读入口 `listMedia` 的 L2 `media.read` 同侧；
 *   有 `menu.media` 的 4 个角色里 `editor` 也有 `media.read`）
 * · `canUpload` = `media.upload`（`editor` 有）/ `canManage` = `media.manage`（仅 `site_admin` / `super_admin`）
 *   —— 界面按此显示按钮，**真正的边界仍在 Action / Route Handler 内的 L2**
 * · 上传本身走 `POST /api/media/upload`（见 `MediaUploader`）；本页只负责列表 + 组装
 * · `?error=` 由 `media-table.tsx` 的删除 Server Action 在失败时带回（`redirect`）
 */
export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; error?: string }>;
}) {
  const { page: rawPage, error: rawError } = await searchParams;

  const session = await auth();
  const role = session?.user.role;

  if (!role || !isRole(role) || !can(role, "menu.media")) {
    notFound();
  }

  const canUpload = can(role, "media.upload");
  const canManage = can(role, "media.manage");

  const result = await listMedia({
    siteId: session?.user.siteId ?? undefined,
    page: rawPage,
    pageSize: "20",
  });

  const errorMessage = rawError ? rawError : result.ok ? null : result.message;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">媒体库</h1>
        <p className="text-sm text-muted-foreground">
          {result.ok
            ? `共 ${result.data.total} 个素材；上传后落到「用途：other」，正文插图与封面选取属 M5。`
            : "素材列表加载失败。"}
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className={ALERT_CLASS}>
          {errorMessage}
        </p>
      ) : null}

      <MediaUploader siteId={session?.user.siteId ?? null} canUpload={canUpload} />

      {result.ok ? <MediaTable items={result.data.items} canManage={canManage} /> : null}
    </div>
  );
}
