import type { Metadata } from "next";

export const metadata: Metadata = { title: "新闻详情" };

// ISR：docs/15 §6 规定详情页 revalidate = 300
export const revalidate = 300;

/**
 * 新闻详情（docs/15 §1 `news/[id]`；U2 裁决：本静态段优先于 `[channel]/[id]`）
 * T1.6 骨架。TODO(T1.10)：GET /api/articles/[idOrSlug]（未发布返回 NOT_FOUND，不泄露草稿存在性）
 */
export default async function NewsDetailPage({
  params,
}: {
  params: Promise<{ locale: string; site: string; id: string }>;
}) {
  const { site, id } = await params;

  return (
    <article className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
      <p className="text-sm text-muted-foreground">新闻详情 · 静态段 news/[id]</p>
      <h1 className="text-2xl font-semibold tracking-tight">文章标题占位</h1>
      <p className="text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/{site}/news/{id}）。正文、附件、评论见 T1.10。
      </p>
      {/* TODO(T1.10)：文章不存在时调用 notFound()，由站点级/栏目级 not-found 渲染 */}
    </article>
  );
}
