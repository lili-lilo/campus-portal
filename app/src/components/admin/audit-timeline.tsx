import { ARTICLE_STATUS_OPTIONS } from "@/components/admin/status-badge";
import { formatTableDate } from "@/lib/date";

import type { AuditRecordItem } from "@/app/admin/articles/actions";

/**
 * 审核时间线（T4.1b）—— **Server Component**（无交互）
 * ============================================================================
 * · 断言要求（`docs/16` §2.6 L193）：能按 `fromStatus → toStatus` 渲染流转文案，且 `reject`
 *   必须区分**初审退回**与**终审退回**（`step` 相同、`fromStatus` 不同）
 * · 6 态中文**复用** `status-badge.tsx` 的 `ARTICLE_STATUS_OPTIONS`（同一份来源，docs/13 §7.1 L119-L124）
 * · `data-slot="audit-timeline"` / `data-slot="audit-item"` 是给 E2E 的稳定锚点
 *   （C1 计数断言：每次流转后 `audit-item` +1）
 */

const STATUS_LABELS = new Map<string, string>(
  ARTICLE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

/** `step` 中文（docs/13 §7.2 的「写入 `AuditRecord`」列；`approve` 为预留值） */
const STEP_LABELS = new Map<string, string>([
  ["submit", "提交"],
  ["review", "审核"],
  ["approve", "终审"],
  ["publish", "发布"],
  ["reject", "退回"],
  ["withdraw", "撤稿"],
]);

function statusLabel(status: string | null): string {
  if (!status) {
    return "—";
  }
  return STATUS_LABELS.get(status) ?? status;
}

/** 流转文案；`toStatus === "rejected"` 时按 `fromStatus` 区分初审 / 终审退回 */
function stepLabel(record: AuditRecordItem): string {
  if (record.toStatus === "rejected") {
    if (record.fromStatus === "pending_first") {
      return "初审退回";
    }
    if (record.fromStatus === "pending_final") {
      return "终审退回";
    }
  }
  return STEP_LABELS.get(record.step) ?? record.step;
}

export function AuditTimeline({ records }: { records: readonly AuditRecordItem[] }) {
  if (records.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无审核记录</p>;
  }

  return (
    <ol data-slot="audit-timeline" className="space-y-2">
      {records.map((record) => (
        <li
          key={record.id}
          data-slot="audit-item"
          className="rounded-lg border border-border/60 px-3 py-2 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{stepLabel(record)}</span>
            <span className="text-muted-foreground">
              {statusLabel(record.fromStatus)} → {statusLabel(record.toStatus)}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{record.operatorName}</span>
            <span>· {record.role}</span>
            <span>· {formatTableDate(record.createdAt)}</span>
          </div>

          {record.comment ? (
            <p className="mt-1 text-xs text-muted-foreground">备注：{record.comment}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
