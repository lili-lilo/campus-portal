import type { Metadata } from "next";

import { ChartPlaceholder } from "@/components/admin/chart-placeholder";
import { StatCard } from "@/components/admin/stat-card";
import { VisitTrendChart } from "@/components/admin/visit-trend-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { getDashboardStats, getVisitTrend } from "./actions";

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
  const [statsResult, trendResult] = await Promise.all([getDashboardStats(), getVisitTrend()]);

  if (!statsResult.ok) {
    return <DashboardNotice message={statsResult.message} />;
  }

  if (!trendResult.ok) {
    return <DashboardNotice message={trendResult.message} />;
  }

  const { siteCount, userCount, mediaCount, articleCount, articlesByStatus, scopeSiteId } =
    statsResult.data;
  const trend = trendResult.data;

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

        <ChartPlaceholder
          title="来源分布"
          hint="Search / Direct / External（getSourceBreakdown）"
        />
        <ChartPlaceholder title="文章排行" hint="按 viewCount 倒序（getArticleRanking）" />
        <ChartPlaceholder title="栏目排行" hint="按栏目下文章数 / 总浏览量（getChannelRanking）" />
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
