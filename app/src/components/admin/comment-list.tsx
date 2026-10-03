import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTableDate } from "@/lib/date";

import {
  approveComment,
  deleteComment,
  rejectComment,
  replyComment,
  type CommentItem,
} from "@/app/admin/comments/actions";

/**
 * 评论列表（M5-4a）—— **Server Component**（无客户端交互）
 * ============================================================================
 * · **平铺审核台**（M5-4a 裁决 ①）：顶级与回复**同为行**，回复行加 `↳` 前缀 + 左侧缩进/竖线；
 *   好处：`status` 过滤覆盖所有层级 ⇒ **待审回复不会被藏在其它状态的父评论下而漏审**
 * · 状态三态中文：`pending` → 待审 / `approved` → 已通过 / `rejected` → 已驳回
 * · 行内操作全部是 `<form action={serverAction}>` + 组件内 `"use server"` 适配层
 *   （照 `media-table.tsx` L28-L44 与 M5-5a 的范式）⇒ **零客户端 JS**
 * · **两级限制的 UI 侧**：只有 `parentId === null` 的行才有「回复」入口；
 *   真正的边界仍由 `replyComment` 的 `VALIDATION_FAILED` 兜底（服务端强制）
 * · 评论内容是**纯文本渲染**（不像文章正文那样 `dangerouslySetInnerHTML`）⇒ React 自动转义，无 XSS 面
 * · `data-slot="comment-item"` 是给 E2E 的稳定锚点（同 `audit-item` 惯例）
 */

/** 表单适配层：`<form action>` 只接受 `(formData: FormData) => …`，故逐个包一层 */
async function approveForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const result = await approveComment({ id });
  revalidatePath("/admin/comments");
  if (!result.ok) {
    redirect(`/admin/comments?error=${encodeURIComponent(result.message)}`);
  }
}

async function rejectForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const result = await rejectComment({ id });
  revalidatePath("/admin/comments");
  if (!result.ok) {
    redirect(`/admin/comments?error=${encodeURIComponent(result.message)}`);
  }
}

async function replyForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const content = String(formData.get("content") ?? "");
  if (!id) {
    return;
  }

  const result = await replyComment({ id, content });
  revalidatePath("/admin/comments");
  if (!result.ok) {
    redirect(`/admin/comments?error=${encodeURIComponent(result.message)}`);
  }
}

async function deleteForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return;
  }

  const result = await deleteComment({ id });
  revalidatePath("/admin/comments");
  if (!result.ok) {
    redirect(`/admin/comments?error=${encodeURIComponent(result.message)}`);
  }
}

/** 三态中文（schema.prisma L343-L344） */
const STATUS_LABELS: Record<string, string> = {
  pending: "待审",
  approved: "已通过",
  rejected: "已驳回",
};

function badgeVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "pending") {
    return "default";
  }
  if (status === "approved") {
    return "secondary";
  }
  return "outline";
}

export function CommentList({ items }: { items: readonly CommentItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无评论。</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>评论人</TableHead>
          <TableHead>内容</TableHead>
          <TableHead>所属文章</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>IP</TableHead>
          <TableHead>时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const isReply = item.parentId !== null;
          return (
            <TableRow key={item.id} data-slot="comment-item">
              <TableCell className={isReply ? "border-l-2 border-muted" : undefined}>
                <span className={isReply ? "block pl-6 text-muted-foreground" : "font-medium"}>
                  {isReply ? `↳ ${item.name}` : item.name}
                </span>
                {item.email ? (
                  <span className="block text-xs text-muted-foreground">{item.email}</span>
                ) : null}
              </TableCell>

              <TableCell className="max-w-sm">
                <p className="whitespace-pre-wrap">{item.content}</p>
                {isReply && item.parent ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    二级回复 · 回复给 {item.parent.name}
                  </p>
                ) : null}
              </TableCell>

              <TableCell className="max-w-[12rem] truncate text-muted-foreground">
                {item.article.title}
              </TableCell>

              <TableCell>
                <Badge variant={badgeVariant(item.status)}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Badge>
              </TableCell>

              <TableCell className="text-muted-foreground">{item.ip ?? "—"}</TableCell>

              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatTableDate(item.createdAt)}
              </TableCell>

              <TableCell>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-2">
                    {item.status !== "approved" ? (
                      <form action={approveForm}>
                        <input type="hidden" name="id" value={item.id} />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          通过
                        </button>
                      </form>
                    ) : null}

                    {item.status !== "rejected" ? (
                      <form action={rejectForm}>
                        <input type="hidden" name="id" value={item.id} />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          驳回
                        </button>
                      </form>
                    ) : null}

                    <form action={deleteForm}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        className={`${buttonVariants({ variant: "ghost", size: "sm" })} text-destructive`}
                      >
                        删除
                      </button>
                    </form>
                  </div>

                  {/* 只有顶级评论可被回复（两级限制的 UI 侧）；`<details>` 零 JS 展开 */}
                  {!isReply ? (
                    <details className="w-full">
                      <summary
                        className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer list-none`}
                      >
                        回复
                      </summary>
                      <form action={replyForm} className="mt-2 flex flex-col items-end gap-2">
                        <input type="hidden" name="id" value={item.id} />
                        <textarea
                          name="content"
                          rows={2}
                          required
                          placeholder="以管理员身份回复（二级，仅此一层）…"
                          className="w-full min-w-[16rem] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs"
                        />
                        <button
                          type="submit"
                          className={buttonVariants({ variant: "default", size: "sm" })}
                        >
                          提交回复
                        </button>
                      </form>
                    </details>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
