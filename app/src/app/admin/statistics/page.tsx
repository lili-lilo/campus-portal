import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RankingBarChart } from "@/components/admin/ranking-bar-chart";
import { SourceBreakdownChart } from "@/components/admin/source-breakdown-chart";
import { VisitTrendChart } from "@/components/admin/visit-trend-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

import { getVisitTrend } from "../dashboard/actions";
import { getArticleRanking, getChannelRanking, getSourceBreakdown } from "./actions";

export const metadata: Metadata = { title: "统计分析" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx`） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 统计分析（M5-3b）—— `docs/15` §9.1 的 `/admin/statistics` 行的 4 个数据源全部落图
 * ============================================================================
 * · 页面 gate = **`menu.statistics`**（与 `admin-sidebar.tsx` 的菜单项 `code` 一致 ⇒ 只有
 *   `site_admin` / `super_admin` 能进）；不通过 → `notFound()`（不泄露存在性，同
 *   `admin/media/page.tsx` L44-L46 的范式）。
 * · 4 个图严格对应 `docs/15` L435 的数据源列：`getVisitTrend`（趋势）/ `getSourceBreakdown`（来源）
 *   / `getArticleRanking`（文章排行）/ `getChannelRanking`（栏目排行）。
 *   `getVisitTrend` 仍是 `../dashboard/actions` 的交付物（M5-3a 裁决：不迁移），本页跨域 import。
 * · Action 层维持 **L1-only**（M5-3a 复核口径）：`can()` 只在页面 gate 判 `menu.statistics`，
 *   与 `statistics/actions.ts` 顶部注释一致。
 * · **Fail 不崩页**：任一 Action 返回 `Fail` 时，把该区块降级为"取数失败"提示，
 *   其余区块照常渲染（后台是排障工具，单点故障不应整页白屏）。
 * · 数据范围与 dashboard 同口径（`docs/14` §5.15）：`super_admin` → 全站 / 其余 → 锁本站。
 */
export default async function StatisticsPage() {
  const session = await auth();
  const role = session?.user.role;

  if (!role || !isRole(role) || !can(role, "menu.statistics")) {
    notFound();
  }

  const [trendResult, sourceResult, articleRankResult, channelRankResult] = await Promise.all([
    getVisitTrend(),
    getSourceBreakdown(),
    getArticleRanking(),
    getChannelRanking(),
  ]);

  // 数据范围口径（与 dashboard/page.tsx 一致）：super_admin 无 siteId → 全站聚合
  const scopeSiteId = session.user.siteId ?? null;
  const scopeLabel = scopeSiteId === null ? "全站聚合" : "本站范围";

  // 取数失败时把 message 带出来，替换该区块内容（不中断其它三图）
  const failMessage = (result: { ok: false; message: string }) => (
    <p role="alert" className="text-sm text-destructive">
      {result.message}
    </p>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">统计分析</h1>
        <p className="text-sm text-muted-foreground">
          数据范围：{scopeLabel}（口径见 docs/14 §5.15）
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">访问趋势（PV / UV / IP）</CardTitle>
            <CardDescription>
              近 90 天 · {scopeLabel} · 数据源 Statistic（按 dateKey 聚合）
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!trendResult.ok ? (
              failMessage(trendResult)
            ) : trendResult.data.length > 0 ? (
              <VisitTrendChart data={trendResult.data} />
            ) : (
              <p className="text-sm text-muted-foreground">暂无统计数据。</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">来源分布</CardTitle>
            <CardDescription>近 90 天 · {scopeLabel} · 数据源 Statistic.source</CardDescription>
          </CardHeader>
          <CardContent>
            {!sourceResult.ok ? (
              failMessage(sourceResult)
            ) : (
              <SourceBreakdownChart data={sourceResult.data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">文章排行</CardTitle>
            <CardDescription>按浏览量倒序 · 已发布 · {scopeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {!articleRankResult.ok ? (
              failMessage(articleRankResult)
            ) : (
              <RankingBarChart
                data={articleRankResult.data.map((row) => ({
                  label: row.title,
                  value: row.viewCount,
                }))}
                barColor="#1a4f8b"
                valueLabel="浏览量"
                emptyText="暂无已发布文章。"
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">栏目排行</CardTitle>
            <CardDescription>按栏目下已发布文章数 · {scopeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {!channelRankResult.ok ? (
              failMessage(channelRankResult)
            ) : (
              <RankingBarChart
                data={channelRankResult.data.map((row) => ({ label: row.name, value: row.count }))}
                barColor="#15803d"
                valueLabel="文章数"
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/*
        热搜词：`docs/14` §5.15 L578 的 `getTopSearchTerms` 为 **A3 降级项**
        （无埋点 ⇒ 返回 `[]` + `degraded: true`）⇒ 本批**不调 Action**，只作静态占位说明。
      */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">热搜词</CardTitle>
          <CardDescription>数据源 getTopSearchTerms（degraded）</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            无埋点数据，暂无热搜词（degraded：接口返回空数组并附 degraded 标志，见 docs/14 §5.15）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
