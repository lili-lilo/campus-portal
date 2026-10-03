import type { Metadata } from "next";
import Link from "next/link";

import { ArticleWorkflowActions } from "@/components/admin/article-workflow-actions";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { auth } from "@/lib/auth";
import { formatTableDate } from "@/lib/date";

import { listPendingAudits } from "../articles/actions";

export const metadata: Metadata = { title: "审核待办" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/**
 * 审核待办（T4.1b）—— `docs/15` §9.1 L430：数据源 `listPendingAudits`，权限 `menu.audits`
 *
 * · Action 内两层鉴权（L1 + L2 `menu.audits`）；`Fail` 时把消息原样显示（不泄露更多）
 * · 队列 = `pending_first` + `pending_final`，按 `updatedAt` 升序（先提交先审）
 * · 每行复用 `ArticleWorkflowActions`：按该行状态渲染可执行按钮（auditor 会看到
 *   「初审通过 / 退回」或「发布 / 退回」）
 */
export default async function AuditsPage() {
  const session = await auth();
  const result = await listPendingAudits({ siteId: session?.user.siteId ?? undefined });

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">审核待办</h1>
        <p role="alert" className={ALERT_CLASS}>
          {result.message}
        </p>
      </div>
    );
  }

  const { items, total } = result.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">审核待办</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 篇待审（先提交先审）。权限：menu.audits。
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          当前没有待审稿件。
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>栏目</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>作者</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-[24rem] font-medium">
                    {/* 与 T3.3 列表同款：标题即编辑入口 */}
                    <Link
                      className="block truncate hover:underline"
                      href={`/admin/articles/${item.id}/edit`}
                    >
                      {item.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.channelName}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.createdByName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTableDate(item.submittedAt)}
                  </TableCell>
                  <TableCell>
                    <ArticleWorkflowActions
                      articleId={item.id}
                      status={item.status}
                      role={session?.user.role ?? ""}
                      isOwner={item.createdById === session?.user.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
