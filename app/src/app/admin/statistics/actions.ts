"use server";

import { requireSession, type Fail, type Ok } from "@/lib/actions-shared";
import { prisma } from "@/lib/prisma";

/**
 * 统计分析取数（M5-3a / `docs/14` §5.15 L575-L577、`docs/15` §9.1 L435）
 * ============================================================================
 * 本文件只放 **3 个新 Action**（`getSourceBreakdown` / `getArticleRanking` / `getChannelRanking`）；
 * `getVisitTrend`（趋势图）**仍在 `app/src/app/admin/dashboard/actions.ts`** —— 它是 T3.2 的交付物，
 * 两页共用由页面 import（`docs/15` L422 / L435 的数据源列本就如此），本批不做跨文件迁移。
 *
 * 鉴权口径（**复核 T3.2 裁决后维持 L1-only**，用户裁决 ①）：
 *   · **L1**：`requireSession()`（会话 + 角色收窄）—— 复用 `@/lib/actions-shared`；
 *   · **L2 不做**：`docs/14` §5.15 的权限列是 `statistics.read`，但**页面 gate** 是
 *     `docs/15` §9.1 的 `menu.statistics`（见 `/admin/statistics`）与 `menu.dashboard`（见 `/admin/dashboard`）。
 *     `editor` / `auditor` 有 `menu.dashboard` 却**没有** `statistics.read` ⇒ 若在 Action 层加 L2，
 *     这两个角色的仪表盘会整页变"无权"。故与 `dashboard/actions.ts` L18-L19 的 T3.2 口径保持一致：
 *     **Action 层只做 L1，权限由页面 gate 承担**。
 *   · 数据范围：`super_admin`（`session.siteId === null`）→ 入参 `siteId`（缺省 = 全站聚合）；
 *     其余角色 → **强制锁 `session.user.siteId`**（忽略入参，防越权）。
 *
 * 返回信封遵 `docs/14` §2.1（`Ok<T>` / `Fail`，来自 `@/lib/actions-shared`）。
 */

/** 来源分布一个切片（`source` 已归一，见 `getSourceBreakdown` 的 null 口径） */
export type SourceBreakdownItem = {
  source: string;
  pv: number;
};

/** 文章排行一行 */
export type ArticleRankingItem = {
  id: string;
  title: string;
  viewCount: number;
};

/** 栏目排行一行（`count` = 已发布未删除文章数；`totalViews` = 这些文章的浏览量和） */
export type ChannelRankingItem = {
  id: string;
  name: string;
  count: number;
  totalViews: number;
};

type ScopeResult = { ok: true; siteId: string | null } | { ok: false; fail: Fail };

/** L1：取会话；并给出**已锁定**的数据范围（其余角色忽略入参） */
async function resolveScope(requestedSiteId?: string): Promise<ScopeResult> {
  const scope = await requireSession();

  if (!scope.ok) {
    return { ok: false, fail: scope.fail };
  }

  const sessionSiteId = scope.session.siteId;

  return {
    ok: true,
    // session.siteId === null ⇒ 全站角色（可经受参收窄到单站）；否则一律锁本站
    siteId: sessionSiteId === null ? (requestedSiteId ?? null) : sessionSiteId,
  };
}

/**
 * Prisma 7 生成物把 `groupBy` 的 `_count` 推成联合类型
 * （`true | { _all?: number } | undefined`）⇒ 显式运行时收窄（同 `dashboard/actions.ts` L62-L71）。
 */
function countOfGroupBy(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "object" && value !== null && "_all" in value) {
    const all = (value as Record<string, unknown>)._all;
    return typeof all === "number" ? all : 0;
  }
  return 0;
}

/** 默认统计窗口（`docs/14` §5.15 L575 的 `days = 90`） */
const DEFAULT_DAYS = 90;
/** 默认排行条数（`docs/14` §5.15 L576/L577 的 `limit = 10`） */
const DEFAULT_LIMIT = 10;

/**
 * 来源分布（`docs/14` §5.15 L575）：`[{ source, pv }]`，`pv` 倒序。
 *
 * `days` 语义与趋势图一致 —— **取最近 N 个 `dateKey`**（`Statistic` 按日一行，A32）：
 * 先取全部 `dateKey` 去重排序（4 站 × 90 天 = 360 行，成本可忽略），再按窗口过滤聚合。
 *
 * **`source` 可空口径（用户裁决 ③）**：`null` 归 **`"direct"`**（"直接访问"最接近"来源未知"，
 * 且不新增 `docs/13` 三值枚举之外的值）；因为 `null` 与 `"direct"` 会被 `groupBy` 分成两组，
 * 故在 JS 侧**合并同 key 求和**。
 */
export async function getSourceBreakdown(input?: {
  siteId?: string;
  days?: number;
}): Promise<Ok<SourceBreakdownItem[]> | Fail> {
  const scope = await resolveScope(input?.siteId);
  if (!scope.ok) {
    return scope.fail;
  }

  const days = input?.days && input.days > 0 ? input.days : DEFAULT_DAYS;
  const where = scope.siteId ? { siteId: scope.siteId } : {};

  const keyRows = await prisma.statistic.findMany({
    where,
    select: { dateKey: true },
    orderBy: { dateKey: "desc" },
  });
  const recentKeys = [...new Set(keyRows.map((row) => row.dateKey))].slice(0, days);

  if (recentKeys.length === 0) {
    return { ok: true, data: [] };
  }

  const grouped = await prisma.statistic.groupBy({
    by: ["source"],
    _sum: { pv: true },
    where: { ...where, dateKey: { in: recentKeys } },
  });

  // ⚠ null 与 "direct" 会分成两组 ⇒ 合并同 key
  const merged = new Map<string, number>();
  for (const row of grouped) {
    const key = row.source ?? "direct";
    merged.set(key, (merged.get(key) ?? 0) + (row._sum.pv ?? 0));
  }

  const data: SourceBreakdownItem[] = [...merged.entries()]
    .map(([source, pv]) => ({ source, pv }))
    .sort((a, b) => b.pv - a.pv);

  return { ok: true, data };
}

/**
 * 文章排行（`docs/14` §5.15 L576）：按 `viewCount` 倒序取前 `limit` 篇。
 *
 * 契约只写了"按 viewCount 倒序"，**此处额外收口 `published` + 未软删除**（本批注释说明）：
 * 排行是前台热度榜，不应把草稿 / 待审 / 已删稿件的浏览量算进来（与 C5 的可见性口径同侧）。
 */
export async function getArticleRanking(input?: {
  siteId?: string;
  limit?: number;
}): Promise<Ok<ArticleRankingItem[]> | Fail> {
  const scope = await resolveScope(input?.siteId);
  if (!scope.ok) {
    return scope.fail;
  }

  const limit = input?.limit && input.limit > 0 ? input.limit : DEFAULT_LIMIT;

  const rows = await prisma.article.findMany({
    where: {
      deletedAt: null,
      status: "published",
      ...(scope.siteId ? { siteId: scope.siteId } : {}),
    },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: { id: true, title: true, viewCount: true },
  });

  return { ok: true, data: rows };
}

/**
 * 栏目排行（`docs/14` §5.15 L577）：按**栏目下已发布文章数**倒序（并列时按总浏览量倒序）取前 `limit`。
 *
 * 实现：一次 `article.groupBy(by:["channelId"])` 同时拿 `_count` 与 `_sum.viewCount`
 * （过滤 `published` + 未软删除），再按 id 取栏目名 ⇒ **2 次查询**，无 N+1。
 */
export async function getChannelRanking(input?: {
  siteId?: string;
  limit?: number;
}): Promise<Ok<ChannelRankingItem[]> | Fail> {
  const scope = await resolveScope(input?.siteId);
  if (!scope.ok) {
    return scope.fail;
  }

  const limit = input?.limit && input.limit > 0 ? input.limit : DEFAULT_LIMIT;

  const grouped = await prisma.article.groupBy({
    by: ["channelId"],
    _count: { _all: true },
    _sum: { viewCount: true },
    where: {
      deletedAt: null,
      status: "published",
      ...(scope.siteId ? { siteId: scope.siteId } : {}),
    },
  });

  if (grouped.length === 0) {
    return { ok: true, data: [] };
  }

  const channels = await prisma.channel.findMany({
    where: { id: { in: grouped.map((row) => row.channelId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(channels.map((channel) => [channel.id, channel.name]));

  const data: ChannelRankingItem[] = grouped
    .map((row) => ({
      id: row.channelId,
      name: nameById.get(row.channelId) ?? "（已删除栏目）",
      count: countOfGroupBy(row._count),
      totalViews: row._sum.viewCount ?? 0,
    }))
    .sort((a, b) => b.count - a.count || b.totalViews - a.totalViews)
    .slice(0, limit);

  return { ok: true, data };
}
