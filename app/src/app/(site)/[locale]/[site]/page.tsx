import type { Metadata } from "next";

export const metadata: Metadata = { title: "首页" };

// ISR：docs/15 §6 规定首页 revalidate = 300
export const revalidate = 300;

/**
 * 站点首页（docs/15 §6 / §6.3 U7：主站用完整模板，子站用简化模板）
 *
 * T1.6 为骨架：只按 `Site.template` 的语义分支渲染不同结构，数据接入见 T1.10。
 * TODO(T1.10)：listArticles(top/recommend)、listMedia(folder=carousel)、getChannelTree、listNavigations
 */
export default async function SiteHomePage({
  params,
}: {
  params: Promise<{ locale: string; site: string }>;
}) {
  const { site } = await params;
  const isDepartment = site !== "main";

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      {isDepartment ? (
        // 子站（cs / ee / ba）：简化模板 —— 无全站轮播、无院系入口，突出本院新闻
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            院系子站 · 简化模板（Site.template = &quot;department&quot;）
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">学院首页</h1>
          <p className="text-sm text-muted-foreground">
            T1.6 路由骨架占位页（/{site}）。本院新闻动态、通知公告、专业介绍见 T1.10。
          </p>
        </section>
      ) : (
        // 主站：完整模板（轮播 + 学校要闻 + 通知公告标签页 + 院系入口 + 快捷入口）
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">
            主站 · 完整模板（Site.template = &quot;default&quot;）
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">XX大学</h1>
          <p className="text-sm text-muted-foreground">
            T1.6 路由骨架占位页（/{site}）。焦点图轮播、学校要闻、通知公告、院系入口见 T1.10。
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border/60 p-4">
          <h2 className="text-base font-medium">要闻区占位</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {isDepartment ? "本院新闻动态（/news）" : "学校要闻（/news）"} —— T1.10 接入。
          </p>
        </div>
        <div className="rounded-lg border border-border/60 p-4">
          <h2 className="text-base font-medium">公告区占位</h2>
          <p className="mt-2 text-sm text-muted-foreground">通知公告（/notice）—— T1.10 接入。</p>
        </div>
      </section>
    </main>
  );
}
