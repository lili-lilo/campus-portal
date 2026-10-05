"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * 仪表盘取数（T3.2 / docs/14 §5.15、docs/15 §9.1）
 * ============================================================================
 * 返回信封遵 docs/14 §2.1：`Ok<T> = { ok: true; data: T }` / `Fail = { ok: false; code; message }`。
 *
 * siteId 口径（T3.2 裁决 2，混合）：
 *   · `super_admin`（`session.user.siteId === null`）→ **全站聚合**（不带 siteId 过滤）
 *   · 其余角色 → **锁 `session.user.siteId`**（docs/14 §2.4 的 L3 数据范围）
 *   · **例外**：站点数卡片**一律不带 siteId 过滤**（显示系统总站点数，不是"本站 = 1"）
 *   · 媒体数：本站过滤时用 `OR: [{ siteId }, { siteId: null }]`
 *     （`Media.siteId` 注释：「空 = 全站共享」，见 schema.prisma L262）
 *
 * 鉴权：本文件只做 **L1**（`await auth()` 判会话）。L2 权限码（`statistics.read`）留第 4 周的
 * `requirePermission`（docs/14 §2.4 L163-L169）；菜单可见性已由 T3.1 的 layout 过滤。
 */

export type DashboardErrorCode = "UNAUTHORIZED" | "INTERNAL_ERROR";

export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; code: DashboardErrorCode; message: string };

export type DashboardStats = {
  /** 系统全部启用站点数（**不受数据范围限制**） */
  siteCount: number;
  /** 启用账号数（按数据范围过滤） */
  userCount: number;
  /** 媒体数（本站 + 全站共享，按数据范围过滤） */
  mediaCount: number;
  /** 文章总数（软删除已排除，按数据范围过滤） */
  articleCount: number;
  /** 六态分布（docs/13 §7.1），键为 `Article.status` 原始取值 */
  articlesByStatus: Record<string, number>;
  /** `null` = 全站聚合；否则为锁定的站点 id（供页面显示口径） */
  scopeSiteId: string | null;
};

/** 趋势图一个点（全天 4 站点求和后的当日值） */
export type VisitTrendPoint = {
  dateKey: string;
  pv: number;
  uv: number;
  ip: number;
};

/** `getVisitTrend` 默认天数（docs/14 §5.15 L572 的 `days = 90`） */
const TREND_DAYS = 90;

function fail(code: DashboardErrorCode, message: string): Fail {
  return { ok: false, code, message };
}

/**
 * Prisma 7 生成物把 `groupBy` 的 `_count` 推成联合类型
 * （`true | { _all?: number } | undefined`，见 `src/generated/prisma/models/Article.ts` L293/L302-L308），
 * `_all` 无法直接取用 → 在此显式做一次运行时收窄（不改裁决指定的查询形状）。
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

type ScopeResult = { ok: true; siteId: string | null } | { ok: false; fail: Fail };

/** L1：取会话并解析数据范围（`null` = 全站） */
async function resolveScope(): Promise<ScopeResult> {
  const session = await auth();

  if (!session) {
    return { ok: false, fail: fail("UNAUTHORIZED", "会话已过期，请重新登录。") };
  }

  return { ok: true, siteId: session.user.siteId ?? null };
}

/**
 * 4 张卡片的取数：**并行 4 条**（M6 起用 `Promise.all`；原为 `$transaction`，在 Supabase 高延迟下会启动超时）。
 */
export async function getDashboardStats(): Promise<Ok<DashboardStats> | Fail> {
  const scope = await resolveScope();
  if (!scope.ok) {
    return scope.fail;
  }
  const { siteId } = scope;

  // 只读并行查询：Promise.all 取代 $transaction（无需原子性；避免 Supabase 高延迟下事务启动超时）
  const [siteCount, articleGroups, userCount, mediaCount] = await Promise.all([
    // 站点数：**不过滤 siteId**（T3.2 裁决 2 的例外）
    prisma.site.count({ where: { status: true } }),
    // 裁决指定的查询形状（by + _count._all）保持不变
    prisma.article.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { deletedAt: null, ...(siteId ? { siteId } : {}) },
      orderBy: { status: "asc" },
    }),
    prisma.user.count({ where: { status: true, ...(siteId ? { siteId } : {}) } }),
    prisma.media.count({
      where: siteId ? { deletedAt: null, OR: [{ siteId }, { siteId: null }] } : { deletedAt: null },
    }),
  ]);

  const articlesByStatus: Record<string, number> = {};
  let articleCount = 0;
  for (const row of articleGroups) {
    const count = countOfGroupBy(row._count);
    articlesByStatus[row.status] = count;
    articleCount += count;
  }

  return {
    ok: true,
    data: { siteCount, userCount, mediaCount, articleCount, articlesByStatus, scopeSiteId: siteId },
  };
}

/**
 * 访问趋势：按 `dateKey` 升序返回**最近 90 天**（docs/14 §5.15 L572「按 `dateKey` 聚合」，A32）。
 * 全站时对 4 个站点的当日值求和（docs/13 Q6 方案 A，不存汇总行）。
 */
export async function getVisitTrend(): Promise<Ok<VisitTrendPoint[]> | Fail> {
  const scope = await resolveScope();
  if (!scope.ok) {
    return scope.fail;
  }
  const { siteId } = scope;

  const grouped = await prisma.statistic.groupBy({
    by: ["dateKey"],
    _sum: { pv: true, uv: true, ip: true },
    where: siteId ? { siteId } : {},
    orderBy: { dateKey: "asc" },
  });

  const points: VisitTrendPoint[] = grouped.slice(-TREND_DAYS).map((row) => ({
    dateKey: row.dateKey,
    pv: row._sum.pv ?? 0,
    uv: row._sum.uv ?? 0,
    ip: row._sum.ip ?? 0,
  }));

  return { ok: true, data: points };
}
