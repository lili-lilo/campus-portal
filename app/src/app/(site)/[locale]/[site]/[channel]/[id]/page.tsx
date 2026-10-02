import type { Metadata } from "next";

export const metadata: Metadata = { title: "文章详情" };

// ISR：docs/15 §6 规定 revalidate = 300
export const revalidate = 300;

/**
 * 非保留 slug 栏目下的文章详情（docs/15 §4.4 `/[site]/[channel]/[id]`，仅 list 型栏目）
 * 与 `news/[id]` 读同一份 Article、渲染同一形态（docs/15 §4.4 的说明）。
 * T1.6 骨架。TODO(T1.10)：GET /api/articles/[idOrSlug]，并断言所在栏目为 list 型。
 */
export default async function ChannelArticlePage({
  params,
}: {
  params: Promise<{ locale: string; site: string; channel: string; id: string }>;
}) {
  const { site, channel, id } = await params;

  return (
    <article className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
      <p className="text-sm text-muted-foreground">文章详情 · 动态段 [channel]/[id]</p>
      <h1 className="text-2xl font-semibold tracking-tight">文章标题占位</h1>
      <p className="text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/{site}/{channel}/{id}）。
      </p>
    </article>
  );
}
