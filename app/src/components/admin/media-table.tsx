import Image from "next/image";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteMedia, type MediaItem } from "@/app/admin/media/actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTableDate } from "@/lib/date";

/**
 * 媒体表格（T3.6b）—— **Server Component**（无 `'use client'`）
 * ============================================================================
 * · 删除走 `<form action={serverAction}>`：**不需要**客户端组件（`recycle-table.tsx` 那种
 *   `useState` + `window.confirm` 范式在这里是多余的 —— 媒体软删是**可恢复的日常管理**，
 *   不做二次确认，也与 `editor` 的"删除文章"（`destructive`）在观感上区分开：这里用 `outline`）
 * · 缩略图用 `next/image` 的 `fill` + `relative` 容器（本地实现不存 `width/height`，
 *   固有尺寸未知 ⇒ 官方建议用 `fill`：`image.md` L113/L115）；`/uploads/**` 是同源路径，
 *   `next.config.ts` 未配 `images.localPatterns` ⇒ 默认放行
 * · 行锚点 `data-slot="media-item"` 供 E2E 定位
 */

/** 表单适配层：`<form action>` 只接受 `(formData: FormData) => …`，故包一层 */
async function deleteMediaForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const result = await deleteMedia({ id });
  revalidatePath("/admin/media");

  if (!result.ok) {
    // `redirect()` 必须放在 try/catch 之外（它靠抛异常工作）
    redirect(`/admin/media?error=${encodeURIComponent(result.message)}`);
  }
}

/** 字节数 → 人类可读（KB / MB，1 位小数） */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaTable({
  items,
  canManage,
}: {
  items: readonly MediaItem[];
  /** `can(role, "media.manage")`：只有 `site_admin` / `super_admin` 为真 */
  canManage: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        媒体库是空的
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>缩略图</TableHead>
            <TableHead>文件名</TableHead>
            <TableHead>类型</TableHead>
            <TableHead>大小</TableHead>
            <TableHead>用途</TableHead>
            <TableHead>上传者</TableHead>
            <TableHead>上传时间</TableHead>
            {canManage ? <TableHead>操作</TableHead> : null}
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} data-slot="media-item">
              <TableCell>
                <div className="relative h-12 w-12 overflow-hidden rounded">
                  <Image
                    src={item.path}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                    // `Media.path` 指向 `public/uploads/**`（本地实现）；未优化直出更省事
                    unoptimized
                  />
                </div>
              </TableCell>
              <TableCell className="max-w-[22rem] truncate font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{item.mimeType ?? item.type}</TableCell>
              <TableCell className="text-muted-foreground">{formatSize(item.size)}</TableCell>
              <TableCell className="text-muted-foreground">{item.folder ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{item.uploader}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatTableDate(item.createdAt)}
              </TableCell>
              {canManage ? (
                <TableCell>
                  <form action={deleteMediaForm}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      删除
                    </button>
                  </form>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
