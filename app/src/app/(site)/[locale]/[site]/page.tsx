import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "首页" };

// ISR：docs/15 §6 规定首页 revalidate = 300
export const revalidate = 300;

/**
 * 首页 —— **T1.8 前的预览版**（第一次让 /main 真读数据库渲染）
 *
 * 数据来源（全部经 `@/lib/prisma` 单例，读 seed 落盘的真实数据）：
 *   · `Site` 全量 4 个站点（顶部站点栏）
 *   · 主站最新 10 篇 `published` 文章（学校要闻，含 `channel.name`）
 *   · 主站 10 个栏目（导航占位）
 *
 * T1.10 替换为正式首页：`listArticles(top/recommend)` + `listMedia(folder=carousel)` +
 * `getChannelTree` + `listNavigations`（docs/14 §5），并按 U7 区分子站简化模板。
 */

// T1.10：docs/13 §5.1 R2 要求「展示层只允许通过一个日期工具模块格式化」，
// 该实例应抽到 `src/lib/date.ts` 共用；本轮受「只改一个文件」约束先内联。
// 用 en-CA + Asia/Shanghai 得到 docs/13 §5.5 的列表页格式 YYYY-MM-DD。
const listDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatListDate(value: Date | null): string {
  return value ? listDateFormatter.format(value) : "—";
}

export default async function SiteHomePage({
  params,
}: {
  params: Promise<{ locale: string; site: string }>;
}) {
  const { site } = await params;

  const sites = await prisma.site.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });

  const mainSite = await prisma.site.findUnique({
    where: { slug: "main" },
    select: { id: true },
  });

  const articles = mainSite
    ? await prisma.article.findMany({
        where: { siteId: mainSite.id, status: "published", deletedAt: null },
        orderBy: { publishTime: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          publishTime: true,
          channel: { select: { name: true } },
        },
      })
    : [];

  const channels = mainSite
    ? await prisma.channel.findMany({
        where: { siteId: mainSite.id, status: true },
        // 栏目按 sort 展示（seed 里各栏目 createdAt 相同，按「最新」排没有区分度）
        // → T1.10 改用 getChannelTree（docs/14 §5.3）
        orderBy: [{ sort: "asc" }, { name: "asc" }],
        take: 10,
        select: { slug: true, name: true },
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      {/* ① 站点栏：4 个站点名横向排列（纯文字；当前站点加粗） */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {sites.map((item) => (
          <span
            key={item.id}
            className={
              item.slug === site ? "font-semibold text-foreground" : "text-muted-foreground"
            }
          >
            {item.name}
          </span>
        ))}
      </section>

      {/* ② 学校要闻：主站最新 10 篇已发布文章 */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">学校要闻</h2>
        {articles.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无已发布文章（请先执行 pnpm db:seed）。</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {articles.map((article) => (
              <li key={article.id} className="flex items-baseline justify-between gap-4 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-muted-foreground">{article.channel.name} · </span>
                  {article.title}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatListDate(article.publishTime)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ③ 栏目：主站 10 个栏目（导航占位） */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold tracking-tight">栏目</h2>
        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无栏目数据。</p>
        ) : (
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {channels.map((channel) => (
              <li key={channel.slug} className="text-muted-foreground">
                {channel.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 text-xs text-muted-foreground">
        T1.8 前的预览版，第 2 周替换为正式首页
      </div>
    </main>
  );
}
