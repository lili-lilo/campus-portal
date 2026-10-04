import { DownloadIcon, FileTextIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "cn";

/**
 * 附件列表（T2.5）—— Server Component
 * ============================================================================
 * · 每项：图标 + 文件名 + 大小（自动 KB/MB 格式化）+ 下载入口；`mimeType` 作为副信息展示
 * · 无附件 → 返回 `null`（调用方无需判断）
 *
 * · 这里**刻意用裸 `<a>` 而不是 next-intl `Link`**：`/api/*` 是 Route Handler，
 *   不能被 locale 前缀改写（`/en/api/...` 会 404）。
 */

export type AttachmentItem = {
  id: string;
  fileName: string;
  /** 字节数 */
  size: number;
  mimeType: string | null;
};

/** 字节数 → 人类可读大小（B / KB / MB，保留 1 位小数） */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

type AttachmentListProps = {
  items: AttachmentItem[];
  className?: string;
};

export async function AttachmentList({ items, className }: AttachmentListProps) {
  if (items.length === 0) {
    return null;
  }

  // Server Component → `getTranslations`（放在早退之后：非 hook）
  const t = await getTranslations("news");

  return (
    <section aria-labelledby="article-attachments" className={cn("space-y-3", className)}>
      <h2
        id="article-attachments"
        className="font-heading text-lg font-semibold tracking-tight text-foreground"
      >
        {t("attachments")}
      </h2>

      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`/api/files/${item.id}/download`}
              className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="flex min-w-0 items-center gap-3">
                <FileTextIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="line-clamp-1 text-sm font-medium text-foreground">
                    {item.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(item.size)}
                    {item.mimeType ? ` · ${item.mimeType}` : ""}
                  </span>
                </span>
              </span>
              <DownloadIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
