"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  purgeFromRecycle,
  restoreFromRecycle,
  type RecycleItem,
} from "@/app/admin/recycle/actions";
import { Button } from "@/components/ui/button";
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
 * 回收站表格（M4 批次 2b）—— **本批唯一的新客户端组件**
 * ============================================================================
 * · 行内两个操作：**恢复**（`restoreFromRecycle`）/ **彻底删除**（`purgeFromRecycle`，物理删除）
 * · 两者都要 `window.confirm`（彻底删除的文案更醒目）；成功后 `router.refresh()` 就地刷新
 * · 失败 → 顶部 `p[role="alert"]`（与 T4.1b 的操作区同款口径）
 * · `data-slot="recycle-item"` 给 E2E 当稳定锚点（`docs/16` §2.4 第 2/3/4 步）
 * · 空态由 `page.tsx` 判定，本组件不重复渲染
 */

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

type ActionResult = { ok: boolean; message?: string };

export function RecycleTable({ items }: { items: readonly RecycleItem[] }) {
  const router = useRouter();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, confirmText: string, action: () => Promise<ActionResult>) {
    if (!window.confirm(confirmText)) {
      return;
    }

    setError(null);
    setPendingKey(key);

    try {
      const result = await action();

      if (!result.ok) {
        setError(result.message ?? "操作失败，请重试。");
        return;
      }

      router.refresh();
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className={ALERT_CLASS}>
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>栏目</TableHead>
              <TableHead>作者</TableHead>
              <TableHead>删除时间</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} data-slot="recycle-item">
                <TableCell className="max-w-[24rem] truncate font-medium">{item.title}</TableCell>
                <TableCell className="text-muted-foreground">{item.channelName}</TableCell>
                <TableCell className="text-muted-foreground">{item.createdByName ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatTableDate(item.deletedAt)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pendingKey !== null}
                      onClick={() =>
                        void run(
                          `restore-${item.id}`,
                          "确认恢复该文章？恢复后状态保持删除前不变。",
                          () => restoreFromRecycle({ entity: "article", id: item.id }),
                        )
                      }
                    >
                      {pendingKey === `restore-${item.id}` ? "处理中…" : "恢复"}
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={pendingKey !== null}
                      onClick={() =>
                        void run(
                          `purge-${item.id}`,
                          "彻底删除后**不可恢复**（同时会级联删除附件等关联数据），确认继续？",
                          () => purgeFromRecycle({ entity: "article", id: item.id }),
                        )
                      }
                    >
                      {pendingKey === `purge-${item.id}` ? "处理中…" : "彻底删除"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
