"use server";

import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isArticleStatus } from "@/lib/state-machine";

/**
 * 文章列表取数（T3.3 / docs/14 §5.1 L279、§2.3 L140-L151、§2.1 L78-L101）
 * ============================================================================
 * 返回信封遵 docs/14 §2.1：`Ok<T> = { ok: true; data: T }` / `Fail = { ok: false; code; message }`。
 * 分页形状遵 §2.1 的 `Paginated<T>`（items/page/pageSize/total/totalPages/hasNext）。
 *
 * 入参（T3.3 裁决 Q1，8 项）：siteId / channelId / status / keyword / page / pageSize / sortBy / sortOrder
 *   · `page` / `pageSize` 以**字符串**传入 —— 收敛（number 解析 + 边界钳制）在本层做（裁决 Q4）
 *   · `includeDeleted` 固定 `false`（不进签名）；`createdById` 本轮不做（M4 才落 C4）
 *   · `siteId` 保留在签名里（与 docs/14 §5.1 一致、供未来站点下拉/Route Handler 复用），
 *     但当前 UI 不传（裁决 Q2：不做 `searchParams.siteId`）
 *
 * 数据范围（裁决 Q2，与 T3.2 同口径）：
 *   · `super_admin` → `input.siteId ?? null`（null = 全站，不加 siteId 过滤）
 *   · 其余角色 → **强制** `session.user.siteId`（忽略调用方传入值）
 *   · 非 super_admin 却没有站点（seed 不会出现）→ 返回空页，宁可空也不越权
 *
 * 日期字段返回 `Date`（RSC 序列化支持，非 HTTP JSON）：与 `src/lib/pages.ts` 的
 * `updatedAt: Date` 同款先例；docs/14 §2.1 L109 的"UTC ISO 8601"约束针对 JSON 响应。
 */

export type ListArticlesErrorCode = "UNAUTHORIZED" | "INTERNAL_ERROR";

export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; code: ListArticlesErrorCode; message: string };

export type ArticleListItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  channelName: string;
  createdByName: string | null;
  publishTime: Date | null;
  viewCount: number;
  updatedAt: Date;
  commentCount: number;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  /** 从 1 开始 */
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

export type ListArticlesInput = {
  siteId?: string;
  channelId?: string;
  status?: string;
  keyword?: string;
  /** 原始字符串：本层做正整数解析，非法 → 1 */
  page?: string;
  /** 原始字符串：非法 → 20；> 100 → 100（docs/14 L145） */
  pageSize?: string;
  sortBy?: string;
  sortOrder?: string;
};

/** 排序白名单（docs/14 §2.3 L146：非白名单回落默认） */
const SORT_BY_WHITELIST = ["updatedAt", "publishTime", "viewCount"] as const;
type SortBy = (typeof SORT_BY_WHITELIST)[number];
type SortOrder = "asc" | "desc";

const DEFAULT_SORT_BY: SortBy = "updatedAt";
const DEFAULT_SORT_ORDER: SortOrder = "desc";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function fail(code: ListArticlesErrorCode, message: string): Fail {
  return { ok: false, code, message };
}

function emptyPage(page: number, pageSize: number): Paginated<ArticleListItem> {
  return { items: [], page, pageSize, total: 0, totalPages: 1, hasNext: false };
}

function isSortBy(value: string | undefined): value is SortBy {
  return value !== undefined && SORT_BY_WHITELIST.some((key) => key === value);
}

/** 仅接受正整数字符串；`0` / `-1` / `1.5` / `abc` / 空串 → `null` */
function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** 排序白名单 → Prisma `orderBy`（显式三分支，避免动态键的类型推断不确定） */
function orderByOf(sortBy: SortBy, sortOrder: SortOrder) {
  if (sortBy === "publishTime") {
    return { publishTime: sortOrder };
  }
  if (sortBy === "viewCount") {
    return { viewCount: sortOrder };
  }
  return { updatedAt: sortOrder };
}

export async function listArticles(
  input: ListArticlesInput = {},
): Promise<Ok<Paginated<ArticleListItem>> | Fail> {
  const session = await auth();

  if (!session) {
    return fail("UNAUTHORIZED", "会话已过期，请重新登录。");
  }

  // ── 收敛（裁决 Q4：Action 层做 number 解析 + 钳制 + 白名单回落）─────────────
  const page = parsePositiveInt(input.page) ?? 1;
  const rawPageSize = parsePositiveInt(input.pageSize);
  const pageSize = rawPageSize === null ? DEFAULT_PAGE_SIZE : Math.min(rawPageSize, MAX_PAGE_SIZE);
  const sortBy = isSortBy(input.sortBy) ? input.sortBy : DEFAULT_SORT_BY;
  const sortOrder: SortOrder = input.sortOrder === "asc" ? "asc" : DEFAULT_SORT_ORDER;

  // ── 数据范围（裁决 Q2）────────────────────────────────────────────────────
  let scopeSiteId: string | null;
  if (isSuperAdmin(session.user.role)) {
    scopeSiteId = input.siteId ?? null;
  } else if (session.user.siteId) {
    scopeSiteId = session.user.siteId;
  } else {
    return { ok: true, data: emptyPage(page, pageSize) };
  }

  const keyword = input.keyword?.trim();
  // 非法 status 走"忽略该过滤"（与 §2.3 的"非白名单回落"同精神），避免手改 URL 时静默空列表
  const status = input.status && isArticleStatus(input.status) ? input.status : undefined;

  const where = {
    // includeDeleted 固定 false（裁决 Q1）：软删除不进列表
    deletedAt: null,
    ...(scopeSiteId ? { siteId: scopeSiteId } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(status ? { status } : {}),
    ...(keyword
      ? { OR: [{ title: { contains: keyword } }, { summary: { contains: keyword } }] }
      : {}),
  };

  // docs/14 §2.3 L151：findMany + count 用 $transaction 一次拿齐
  const [rows, total] = await prisma.$transaction([
    prisma.article.findMany({
      where,
      orderBy: orderByOf(sortBy, sortOrder),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        publishTime: true,
        viewCount: true,
        updatedAt: true,
        channel: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    prisma.article.count({ where }),
  ]);

  const items: ArticleListItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    channelName: row.channel.name,
    createdByName: row.createdBy?.name ?? null,
    publishTime: row.publishTime,
    viewCount: row.viewCount,
    updatedAt: row.updatedAt,
    commentCount: row._count.comments,
  }));

  return {
    ok: true,
    data: {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: page * pageSize < total,
    },
  };
}
