import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * 文章状态徽章（T3.3）—— **Server Component**（无交互）
 * ============================================================================
 * 文案严格取自 `docs/13` §7.1 L119-L124（6 态中文名）：
 *   草稿 / 待初审 / 待终审 / 已发布 / 已退回 / 已撤稿
 *
 * 实现口径（T3.3 裁决 Q5）：
 *   · 单 prop `status: string`；**未知取值回显原值**并给中性样式，不抛错
 *   · `variant="outline"` + 自定义 className —— **不改 `ui/badge.tsx`（冻结区）**
 *   · 现有 badge variant 里没有 success/warning，故用 token + 一档 amber 作状态强调；
 *     文案本身互不相同，已满足 `docs/16` §2.6 L192「6 种状态各有**可区分**的文案」
 */

/** 6 态顺序与中文名（docs/13 §7.1），筛选下拉复用同一份来源 */
export const ARTICLE_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "draft", label: "草稿" },
  { value: "pending_first", label: "待初审" },
  { value: "pending_final", label: "待终审" },
  { value: "published", label: "已发布" },
  { value: "rejected", label: "已退回" },
  { value: "withdrawn", label: "已撤稿" },
];

const STATUS_LABELS = new Map<string, string>(
  ARTICLE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
);

/** 每态的视觉强调（token 优先；无对应 token 的过渡态用一档 amber） */
const STATUS_CLASSES = new Map<string, string>([
  ["draft", "border-border text-muted-foreground"],
  ["pending_first", "border-amber-500/40 text-amber-700"],
  ["pending_final", "border-amber-600/60 text-amber-800"],
  ["published", "border-primary/40 text-primary"],
  ["rejected", "border-destructive/40 text-destructive"],
  ["withdrawn", "border-border text-muted-foreground line-through"],
]);

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS.get(status) ?? status;

  return (
    <Badge
      variant="outline"
      className={cn("whitespace-nowrap", STATUS_CLASSES.get(status) ?? "text-muted-foreground")}
    >
      {label}
    </Badge>
  );
}
