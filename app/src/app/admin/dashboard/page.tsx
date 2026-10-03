import type { Metadata } from "next";

import { RankingBarChart } from "@/components/admin/ranking-bar-chart";
import { SourceBreakdownChart } from "@/components/admin/source-breakdown-chart";
import { StatCard } from "@/components/admin/stat-card";
import { VisitTrendChart } from "@/components/admin/visit-trend-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { getDashboardStats, getVisitTrend } from "./actions";
import { getArticleRanking, getChannelRanking, getSourceBreakdown } from "../statistics/actions";

export const metadata: Metadata = { title: "仪表盘" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

/**
 * 六态中文名（docs/13 §7.1）。
 * 后台文案沿用硬编码中文（T3.2 裁决 6，与 T3.1 已落盘的 `ADMIN_MENU.label` 一致）。
 */
const STATUS_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["published", "已发布"],
  ["pending_first", "待初审"],
  ["pending_final", "待终审"],
  ["draft", "草稿"],
  ["rejected", "已退回"],
  ["withdrawn", "已撤稿"],
];

export default async function DashboardPage() {
  // M5-3a：4 图全部接真数据（3 个新 Action 来自 `../statistics/actions`，与 /admin/statistics 共用）
  const [statsResult, trendResult, sourceResult, articleRankResult, channelRankResult] =
    await Promise.all([
      getDashboardStats(),
      getVisitTrend(),
      getSourceBreakdown(),
      getArticleRanking(),
      getChannelRanking(),
    ]);

  if (!statsResult.ok) {
    return <DashboardNotice message={statsResult.message} />;
  }

  if (!trendResult.ok) {
    return <DashboardNotice message={trendResult.message} />;
  }

  if (!sourceResult.ok) {
    return <DashboardNotice message={sourceResult.message} />;
  }

  if (!articleRankResult.ok) {
    return <DashboardNotice message={articleRankResult.message} />;
  }

  if (!channelRankResult.ok) {
    return <DashboardNotice message={channelRankResult.message} />;
  }

  const { siteCount, userCount, mediaCount, articleCount, articlesByStatus, scopeSiteId } =
    statsResult.data;
  const trend = trendResult.data;
  const sourceBreakdown = sourceResult.data;
  const articleRanking = articleRankResult.data;
  const channelRanking = channelRankResult.data;

  // 数据范围口径（T3.2 裁决 2）：super_admin → 全站聚合；其余角色 → 锁本站
  const scopeLabel = scopeSiteId === null ? "全站聚合" : "本站范围";
  const statusHint = STATUS_LABELS.map(
    ([key, label]) => `${label} ${articlesByStatus[key] ?? 0}`,
  ).join(" · ");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">仪表盘</h1>
        <p className="text-sm text-muted-foreground">
          数据范围：{scopeLabel}（口径见 docs/14 §5.15）
        </p>
      </div>

      {/* 4 张统计卡片（T3.2 裁决 1） */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="站点数" value={siteCount} hint="系统全部启用站点（不受数据范围限制）" />
        <StatCard label="文章数" value={articleCount} hint={statusHint} />
        <StatCard label="用户数" value={userCount} hint={`启用账号 · ${scopeLabel}`} />
        <StatCard label="媒体数" value={mediaCount} hint={`含全站共享素材 · ${scopeLabel}`} />
      </section>

      {/* 4 个图表容器：1 真图 + 3 占位（T3.2 裁决 1） */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">访问趋势（PV / UV / IP）</CardTitle>
            <CardDescription>
              近 90 天 · {scopeLabel} · 数据源 Statistic（按 dateKey 聚合）
            </CardDescription>
          </CardHeader>

          <CardContent>
            {trend.length > 0 ? (
              <VisitTrendChart data={trend} />
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
            <SourceBreakdownChart data={sourceBreakdown} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">文章排行</CardTitle>
            <CardDescription>按浏览量倒序 · 已发布 · {scopeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankingBarChart
              data={articleRanking.map((row) => ({ label: row.title, value: row.viewCount }))}
              barColor="#1a4f8b"
              valueLabel="浏览量"
              emptyText="暂无已发布文章。"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">栏目排行</CardTitle>
            <CardDescription>按栏目下已发布文章数 · {scopeLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <RankingBarChart
              data={channelRanking.map((row) => ({ label: row.name, value: row.count }))}
              barColor="#15803d"
              valueLabel="文章数"
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/** 取数失败兜底（`role="alert"` 沿用登录页的选择器约定，docs/00 §8 #60） */
function DashboardNotice({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">仪表盘</h1>
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {message}
      </p>
    </div>
  );
}
