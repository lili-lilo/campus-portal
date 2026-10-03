import Link from "next/link";

import { ARTICLE_STATUS_OPTIONS } from "@/components/admin/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 文章筛选区（T3.3 裁决 Q3）—— **Server Component + 原生表单 GET**
 * ============================================================================
 * · `<form method="get" action="/admin/articles">`：提交后参数进 URL，服务端读 `searchParams`
 *   → 零客户端 JS；刷新/分享/后退都正确，且与分页天然共存
 * · 状态用**原生 `<select>`**：空选项提交 `status=`，页面层按 Q4 的"空串转 undefined"处理；
 *   刻意**不用** `ui/select.tsx`（Radix）—— 它要求非空 `value`（需哨兵值污染 URL），
 *   且会引入客户端边界；此处样式对齐 `ui/select.tsx` 的 trigger 观感
 * · 「重置」是指向无参 URL 的链接（不发请求、可右键新开）
 */
const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ArticleFilter({ status, keyword }: { status?: string; keyword?: string }) {
  return (
    <form
      method="get"
      action="/admin/articles"
      className="flex flex-wrap items-end gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="space-y-1.5">
        <Label htmlFor="filter-status">状态</Label>
        <select
          id="filter-status"
          name="status"
          defaultValue={status ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">全部状态</option>
          {ARTICLE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-keyword">关键词</Label>
        <Input
          id="filter-keyword"
          name="keyword"
          defaultValue={keyword ?? ""}
          placeholder="标题或摘要"
          className="w-56"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          筛选
        </Button>

        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/admin/articles">
          重置
        </Link>
      </div>
    </form>
  );
}
