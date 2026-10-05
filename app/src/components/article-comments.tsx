import { getTranslations } from "next-intl/server";
import { cache } from "react";

import { formatTableDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";

/**
 * 文章评论区（M5-4b）—— **只读**、Server Component
 * ============================================================================
 * · 可见性口径 = `status='approved' AND deletedAt IS NULL`（`docs/14` L413），**顶级 + 各自回复**两级
 *   （`docs/11` L83-L84：前台用两级缩进即可，不做无限嵌套）
 * · **取数走直连 Prisma**（与 `fetchArticleDetail` 同范式，见 `article-detail.tsx` L46）：前台 RSC 全站
 *   都是直连库 ⇒ 无自请求、无 host 拼接、类型直连，且可随详情页一起进 ISR。
 *   公开端点 `GET /api/comments`（本批同时实现）供客户端/外部调用，**本组件不消费它**（有意为之）。
 * · **防御**：顶级 `take: 20`、每个父的回复 `take: 20`（`orderBy` 分别 desc / asc）；头部显示总数。
 * · **只读**：没有任何提交/回复入口（匿名提交 `POST /api/comments` 按 M5-4a 裁决 ④ 留 M6）。
 * · **纯文本渲染**：`{item.content}` 由 React 自动转义（不像文章正文走 `sanitizeHtml`）⇒ 无 XSS 面。
 * · ⚠ 详情页 ISR = 300s（`docs/15` §6；`news/[id]/page.tsx` L11-L12 / `[channel]/[id]/page.tsx` L12-L13）
 *   ⇒ 后台审批通过后，前台**最多 5 分钟**后可见；本批**有意不**在审批 Action 里补 `revalidatePath`
 *   前台路径（M5-4b 裁决：留 M6，届时需按 zh/en 两条公开 URL 分别 revalidate）。
 * · `data-slot="article-comment"` / `"article-comment-reply"` 是给将来 E2E 的稳定锚点
 *   （同 `audit-item` / `comment-item` 惯例）。
 */

type PublicComment = {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
};

type PublicCommentWithReplies = PublicComment & { replies: PublicComment[] };

/**
 * 同请求内只查一次库（`cache()`，与 `fetchArticleDetail` 同款；React 会自动去重）。
 */
const loadComments = cache(async (articleId: string) => {
  const visible = { articleId, status: "approved", deletedAt: null };
  const topLevel = { ...visible, parentId: null };

  // 只读并行查询：Promise.all 取代 $transaction（无需原子性；避免 Supabase 高延迟下事务启动超时）
  const [items, total] = await Promise.all([
    prisma.comment.findMany({
      where: topLevel,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        content: true,
        createdAt: true,
        replies: {
          where: { status: "approved", deletedAt: null },
          orderBy: { createdAt: "asc" },
          take: 20,
          select: { id: true, name: true, content: true, createdAt: true },
        },
      },
    }),
    prisma.comment.count({ where: topLevel }),
  ]);

  return { items: items as PublicCommentWithReplies[], total };
});

export async function ArticleComments({ articleId }: { articleId: string }) {
  const { items, total } = await loadComments(articleId);
  const t = await getTranslations("news");

  return (
    <section className="mt-12 space-y-6" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="font-heading text-xl font-semibold tracking-tight">
        {t("commentsCount", { count: total })}
      </h2>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">{t("commentsEmpty")}</p>
      ) : (
        <ul className="space-y-6">
          {items.map((item) => (
            <li
              key={item.id}
              data-slot="article-comment"
              className="rounded-card border border-border bg-card p-card shadow-card"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="text-muted-foreground">{formatTableDate(item.createdAt)}</span>
              </div>

              <p className="mt-2 text-sm leading-body whitespace-pre-wrap text-foreground">
                {item.content}
              </p>

              {item.replies.length > 0 ? (
                <ul className="mt-3 ml-6 space-y-2 border-l-2 border-muted pl-4">
                  {item.replies.map((reply) => (
                    <li key={reply.id} data-slot="article-comment-reply">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="text-muted-foreground">↳</span>
                        <span className="font-medium text-foreground">{reply.name}</span>
                        <span className="text-muted-foreground">
                          {formatTableDate(reply.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-body whitespace-pre-wrap text-foreground">
                        {reply.content}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
