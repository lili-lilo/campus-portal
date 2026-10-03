import { StatusBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTableDate } from "@/lib/date";

import type { ArticleListItem } from "@/app/admin/articles/actions";

/**
 * 文章列表表格（T3.3）—— **Server Component**（`ui/table.tsx` 是客户端组件，此处只做组合）
 * ============================================================================
 * 列（8 列）：标题 / 栏目 / 状态 / 作者 / 发布时间 / 浏览量 / 评论 / 更新时间
 *   · 时间统一走 `formatTableDate`（`src/lib/date.ts` L69，`YYYY-MM-DD HH:mm:ss`，docs/13 §5.5）
 *   · 状态走 `StatusBadge`（docs/16 §2.6）
 *   · 空态：列表为空时给一句提示，不渲染空表
 */
const COLUMNS = ["标题", "栏目", "状态", "作者", "发布时间", "浏览量", "评论", "更新时间"] as const;

export function ArticleTable({ items }: { items: readonly ArticleListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        没有符合条件的文章。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((column) => (
              <TableHead key={column}>{column}</TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-[26rem] truncate font-medium">{item.title}</TableCell>
              <TableCell className="text-muted-foreground">{item.channelName}</TableCell>
              <TableCell>
                <StatusBadge status={item.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{item.createdByName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatTableDate(item.publishTime)}
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">{item.viewCount}</TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {item.commentCount}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatTableDate(item.updatedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
