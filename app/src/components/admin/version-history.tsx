import { formatTableDate } from "@/lib/date";

import type { ArticleVersionItem } from "@/app/admin/articles/actions";

/**
 * 版本历史（M4 批次 1）—— **Server Component**（无交互）
 * ============================================================================
 * · 数据来自 `listVersions`（`docs/14` §5.2 L283），一次性列出（M4 版本数 < 10，不分页）
 * · 快照由 `writeArticle` 在 `fromStatus === "published"` 时写入（**C3**，`docs/13` §7.4 L199）
 * · `data-slot="version-item"` 给 E2E 当稳定锚点（C3 断言：编辑已发布文章后恰好 +1 条，
 *   且内容为**编辑前**的标题）
 * · 本轮**不做**"还原"按钮 —— `restoreVersion`（`docs/14` §5.1 L298）属 M5
 */

export function VersionHistory({ versions }: { versions: readonly ArticleVersionItem[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold tracking-tight">版本历史</h2>

      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无版本记录</p>
      ) : (
        <ol data-slot="version-timeline" className="space-y-2">
          {versions.map((item) => (
            <li
              key={item.id}
              data-slot="version-item"
              className="rounded-lg border border-border/60 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">v{item.version}</span>
                <span className="truncate text-muted-foreground">{item.title}</span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{item.editor}</span>
                <span>· {formatTableDate(item.createdAt)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
