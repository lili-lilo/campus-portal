import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleForm } from "@/components/admin/article-form";
import { ArticleWorkflowActions } from "@/components/admin/article-workflow-actions";
import { AuditTimeline } from "@/components/admin/audit-timeline";
import { StatusBadge } from "@/components/admin/status-badge";
import { auth } from "@/lib/auth";

import { getArticle, getChannelTree, listAuditRecords } from "../../actions";

export const metadata: Metadata = { title: "编辑文章" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/**
 * 编辑文章（T3.5 表单 → T4.1b 加审核操作区与审核记录）
 *
 * · `params` 是 **Promise**（Next 16：官方 `page.md` L13；仓内先例 `news/[id]/page.tsx` L23/L25）
 * · 加载失败（不存在 / 已软删除 / 超出数据范围，含 C4）→ `notFound()`，不泄露存在性
 * · 操作区（提交 / 通过 / 退回 / 发布 / 撤稿）按状态 + 角色渲染，规则由 `lib/state-machine.ts` 提供；
 *   `isOwner` 供 `editor` 的 C4 判断（`createdById === session.user.id`）
 * · 保存草稿仍是边 8；「已发布 → 草稿」时 Action 内会先落版本快照（C3）
 */
export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const [article, channels, audits] = await Promise.all([
    getArticle({ id }),
    getChannelTree({ siteId: session?.user.siteId ?? undefined }),
    listAuditRecords({ articleId: id }),
  ]);

  if (!article.ok) {
    notFound();
  }

  const detail = article.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">编辑文章</h1>
          <p className="text-sm text-muted-foreground">
            保存后状态回到「草稿」（边 8）；若当前为「已发布」，会先落一份版本快照（C3）。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span data-slot="article-status">
            <StatusBadge status={detail.status} />
          </span>

          {session ? (
            <ArticleWorkflowActions
              articleId={detail.id}
              status={detail.status}
              role={session.user.role}
              isOwner={detail.createdById === session.user.id}
            />
          ) : null}
        </div>
      </div>

      {channels.ok ? (
        <ArticleForm
          mode="edit"
          initialData={{
            id: detail.id,
            channelId: detail.channelId,
            title: detail.title,
            slug: detail.slug,
            summary: detail.summary,
            content: detail.content,
            cover: detail.cover,
          }}
          channelTree={channels.data}
        />
      ) : (
        <p role="alert" className={ALERT_CLASS}>
          {channels.message}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight">审核记录</h2>

        {audits.ok ? (
          <AuditTimeline records={audits.data} />
        ) : (
          <p role="alert" className={ALERT_CLASS}>
            {audits.message}
          </p>
        )}
      </section>
    </div>
  );
}
