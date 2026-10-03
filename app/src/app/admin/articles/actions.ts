"use server";

import { auth } from "@/lib/auth";
import { ROLE_CODES, inScope, isSuperAdmin, type Role } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/sanitize";
import { isSlugReservedForAdmin } from "@/lib/slug";
import {
  isArticleStatus,
  saveArticleDraft as transitionSaveDraft,
  type ArticleStatus,
} from "@/lib/state-machine";
import { articleFormSchema, type ArticleFormValues } from "@/lib/validation/article";

/**
 * 文章 Server Actions —— T3.3（列表只读）+ T3.5（新建/编辑写入）
 * ============================================================================
 * 返回信封遵 docs/14 §2.1：`Ok<T> = { ok: true; data: T }` / `Fail = { ok: false; code; message; field? }`。
 * 错误码取 docs/14 §2.2：`UNAUTHORIZED`(401) / `FORBIDDEN`(403) / `NOT_FOUND`(404) /
 * `VALIDATION_FAILED`(400) / `SLUG_RESERVED`(409) / `SLUG_TAKEN`(409) / `INVALID_STATE_TRANSITION`(400)。
 *
 * ── T3.3 `listArticles` ─────────────────────────────────────────────────────
 * 入参 8 项：siteId / channelId / status / keyword / page / pageSize / sortBy / sortOrder
 * （`includeDeleted` 固定 false；`createdById` M4 再谈）。数据范围：`super_admin` 全站，其余锁本站。
 *
 * ── T3.5 `getChannelTree` / `getArticle` / `createArticle` / `updateArticle` / `saveArticleDraft` ──
 * · 三个写 Action 的共同顺序：**L1 `auth()` → zod `safeParse` → `sanitizeHtml`（A30）→ prisma**；
 *   `updateArticle` / `saveArticleDraft` 另有 **L3/L4 `inScope()`（C4）** 与 **C3 快照 + C1 AuditRecord**。
 * · `getChannelTree` 本轮**只做 L1**：`editor` 的 10 条权限里没有 `channel.read`（permissions.ts L80-L92），
 *   若按 L2 卡会直接做不了新建表单；L2 统一留第 4 周 `requirePermission`（docs/14 §2.4 L163-L169）。T3.7 再抽走。
 * · `AuditRecord` 的 `operatorName` / `role` **非空**（schema.prisma L240 / L244），故每次留痕都带上。
 * · 日期字段返回 `Date`（RSC 序列化支持，非 HTTP JSON）：与 `src/lib/pages.ts` 的 `updatedAt: Date` 同款先例。
 */

export type ArticleErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_FAILED"
  | "SLUG_RESERVED"
  | "SLUG_TAKEN"
  | "INVALID_STATE_TRANSITION"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; code: ArticleErrorCode; message: string; field?: string };

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

/** 栏目下拉的一个选项（`getChannelTree`） */
export type ChannelOption = {
  id: string;
  name: string;
  /** 树深度（0 = 根），用于下拉缩进 */
  depth: number;
  /** 站点名：super_admin 会拿到多站点栏目，前端据此决定是否展示 */
  siteName: string;
};

/** 文章详情（`getArticle`）—— M3 子集：`attachments[]` / `mediaIds[]` 属 M4 */
export type ArticleDetail = {
  id: string;
  channelId: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  cover: string;
  status: string;
};

/** 写入入参 = 表单六字段（T3.5 裁决 Q1；`siteId` 由 Action 从栏目推导） */
export type ArticleWriteInput = ArticleFormValues;

/** 排序白名单（docs/14 §2.3 L146：非白名单回落默认） */
const SORT_BY_WHITELIST = ["updatedAt", "publishTime", "viewCount"] as const;
type SortBy = (typeof SORT_BY_WHITELIST)[number];
type SortOrder = "asc" | "desc";

const DEFAULT_SORT_BY: SortBy = "updatedAt";
const DEFAULT_SORT_ORDER: SortOrder = "desc";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function fail(code: ArticleErrorCode, message: string, field?: string): Fail {
  return field ? { ok: false, code, message, field } : { ok: false, code, message };
}

function emptyPage(page: number, pageSize: number): Paginated<ArticleListItem> {
  return { items: [], page, pageSize, total: 0, totalPages: 1, hasNext: false };
}

function isSortBy(value: string | undefined): value is SortBy {
  return value !== undefined && SORT_BY_WHITELIST.some((key) => key === value);
}

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
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

/** zod 失败 → 取第一条消息（`Fail.message` 面向用户，docs/14 §2.1 L88） */
function firstIssueMessage(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "入参校验失败。";
}

/** Prisma 唯一键冲突（P2002）—— 并发下兜底成 `SLUG_TAKEN` */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

/** A30（docs/11 L218）：写入侧清洗，三个写 Action 共用（`sanitize-html` 白名单见 `src/lib/sanitize.ts`） */
function cleanContent(html: string): string {
  return sanitizeHtml(html);
}

/** `summary` / `cover` 的空串 → `null`（docs/14 §2.1 L111） */
function nullableText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type SessionContext = {
  userId: string;
  /** 展示用名（`AuditRecord.operatorName` / `ArticleVersion.editor` 用，均非空） */
  userLabel: string;
  role: Role;
  siteId: string | null;
};

type SessionResult = { ok: true; session: SessionContext } | { ok: false; fail: Fail };

/** L1：会话 + 角色收窄（角色不在 4 个已知值内 → `FORBIDDEN`） */
async function requireSession(): Promise<SessionResult> {
  const session = await auth();

  if (!session) {
    return { ok: false, fail: fail("UNAUTHORIZED", "会话已过期，请重新登录。") };
  }

  if (!isRole(session.user.role)) {
    return { ok: false, fail: fail("FORBIDDEN", "当前账号角色不可用，请联系管理员。") };
  }

  return {
    ok: true,
    session: {
      userId: session.user.id,
      userLabel: session.user.name ?? session.user.id,
      role: session.user.role,
      siteId: session.user.siteId ?? null,
    },
  };
}

/** 数据范围（与 `listArticles` 同口径）：super_admin → 请求值（null = 全站）；其余角色锁本站 */
function scopeSiteIdOf(session: SessionContext, requested?: string): string | null {
  return isSuperAdmin(session.role) ? (requested ?? null) : session.siteId;
}

// ─────────────────────────────────────────────────────────────────────────────
// T3.3 读取：列表
// ─────────────────────────────────────────────────────────────────────────────

export async function listArticles(
  input: ListArticlesInput = {},
): Promise<Ok<Paginated<ArticleListItem>> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  // ── 收敛（裁决 Q4：Action 层做 number 解析 + 钳制 + 白名单回落）─────────────
  const page = parsePositiveInt(input.page) ?? 1;
  const rawPageSize = parsePositiveInt(input.pageSize);
  const pageSize = rawPageSize === null ? DEFAULT_PAGE_SIZE : Math.min(rawPageSize, MAX_PAGE_SIZE);
  const sortBy = isSortBy(input.sortBy) ? input.sortBy : DEFAULT_SORT_BY;
  const sortOrder: SortOrder = input.sortOrder === "asc" ? "asc" : DEFAULT_SORT_ORDER;

  // ── 数据范围（裁决 Q2）────────────────────────────────────────────────────
  const requestedSiteId = scopeSiteIdOf(session, input.siteId);
  if (!isSuperAdmin(session.role) && !requestedSiteId) {
    return { ok: true, data: emptyPage(page, pageSize) };
  }

  const keyword = input.keyword?.trim();
  // 非法 status 走"忽略该过滤"（与 §2.3 的"非白名单回落"同精神），避免手改 URL 时静默空列表
  const status = input.status && isArticleStatus(input.status) ? input.status : undefined;

  const where = {
    // includeDeleted 固定 false（裁决 Q1）：软删除不进列表
    deletedAt: null,
    ...(requestedSiteId ? { siteId: requestedSiteId } : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// T3.5 读取：栏目树 / 文章详情
// ─────────────────────────────────────────────────────────────────────────────

type ChannelRow = {
  id: string;
  name: string;
  parentId: string | null;
  site: { name: string };
};

/** 扁平行 → 深度优先的选项数组（带 `depth`，供下拉缩进） */
function toChannelOptions(rows: readonly ChannelRow[]): ChannelOption[] {
  const childrenOf = new Map<string | null, ChannelRow[]>();
  for (const row of rows) {
    const list = childrenOf.get(row.parentId);
    if (list) {
      list.push(row);
    } else {
      childrenOf.set(row.parentId, [row]);
    }
  }

  const options: ChannelOption[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const row of childrenOf.get(parentId) ?? []) {
      options.push({ id: row.id, name: row.name, depth, siteName: row.site.name });
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);

  // 兜底：父节点不在结果集内（理论上不会）→ 以根节点身份追加，避免选项丢失
  if (options.length !== rows.length) {
    const seen = new Set(options.map((option) => option.id));
    for (const row of rows) {
      if (!seen.has(row.id)) {
        options.push({ id: row.id, name: row.name, depth: 0, siteName: row.site.name });
      }
    }
  }

  return options;
}

/**
 * 栏目下拉数据。**本轮只做 L1**（见文件头说明）；只返回 `type = "list"` 的启用栏目
 * —— 文章只能挂在列表栏目下（`page` / `link` / `form` 不是文章容器）。
 */
export async function getChannelTree(
  input: { siteId?: string } = {},
): Promise<Ok<ChannelOption[]> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;
  const siteId = scopeSiteIdOf(session, input.siteId);

  if (!isSuperAdmin(session.role) && !siteId) {
    return { ok: true, data: [] };
  }

  const rows = await prisma.channel.findMany({
    where: { status: true, type: "list", ...(siteId ? { siteId } : {}) },
    orderBy: [{ sort: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, site: { select: { name: true } } },
  });

  return { ok: true, data: toChannelOptions(rows) };
}

/** 文章详情（编辑页）。不存在 / 已软删除 / 超出数据范围 → `NOT_FOUND`（不泄露存在性）。 */
export async function getArticle(input: { id: string }): Promise<Ok<ArticleDetail> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  const article = await prisma.article.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      id: true,
      siteId: true,
      channelId: true,
      title: true,
      slug: true,
      summary: true,
      content: true,
      cover: true,
      status: true,
      createdById: true,
    },
  });

  if (!article) {
    return fail("NOT_FOUND", "文章不存在或已删除。");
  }

  // L3 / C4（docs/13 §7.4 L200）：站点范围 + `editor` 仅本人稿件
  const scopeError = inScope(
    session.role,
    session.siteId,
    { siteId: article.siteId, createdById: article.createdById },
    session.userId,
  );
  if (scopeError) {
    return fail("FORBIDDEN", "无权访问该文章。");
  }

  return {
    ok: true,
    data: {
      id: article.id,
      channelId: article.channelId,
      title: article.title,
      slug: article.slug,
      summary: article.summary ?? "",
      content: article.content,
      cover: article.cover ?? "",
      status: article.status,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// T3.5 写入：新建 / 更新（= 保存草稿）
// ─────────────────────────────────────────────────────────────────────────────

/** 新建文章：落库 `draft`，`createdById = session.user.id`（docs/14 §5.1 L289）—— 创建不算状态变更，不写 `AuditRecord` */
export async function createArticle(input: ArticleWriteInput): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  // 保留字先判：回契约码 `SLUG_RESERVED` + `field:"slug"`（docs/14 §2.2 L128；schema 内同名 refine 只负责客户端提示）
  if (isSlugReservedForAdmin(input.slug)) {
    return fail("SLUG_RESERVED", "该 slug 是系统保留字，请换一个。", "slug");
  }

  const parsed = articleFormSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", firstIssueMessage(parsed.error.issues));
  }
  const values = parsed.data;

  // `Article.siteId` 非空（schema.prisma L126）而表单不含 siteId ⇒ 由所选**栏目**推导站点
  const channel = await prisma.channel.findFirst({
    where: { id: values.channelId, status: true },
    select: { id: true, siteId: true },
  });
  if (!channel) {
    return fail("VALIDATION_FAILED", "所选栏目不存在。", "channelId");
  }

  // L3：目标站点须在范围内；新建稿件的归属人就是当前用户（故按 `createdById = userId` 判 C4）
  const scopeError = inScope(
    session.role,
    session.siteId,
    { siteId: channel.siteId, createdById: session.userId },
    session.userId,
  );
  if (scopeError) {
    return fail("FORBIDDEN", "无权在该栏目下创建文章。");
  }

  const taken = await prisma.article.findFirst({
    where: { siteId: channel.siteId, slug: values.slug },
    select: { id: true },
  });
  if (taken) {
    return fail("SLUG_TAKEN", "该 slug 在本站点已存在。", "slug");
  }

  try {
    const created = await prisma.article.create({
      data: {
        siteId: channel.siteId,
        channelId: channel.id,
        title: values.title,
        slug: values.slug,
        summary: nullableText(values.summary),
        content: cleanContent(values.content),
        cover: nullableText(values.cover),
        status: "draft",
        createdById: session.userId,
      },
      select: { id: true },
    });

    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("SLUG_TAKEN", "该 slug 在本站点已存在。", "slug");
    }
    throw error;
  }
}

/**
 * 更新 / 保存草稿的**共用实现**（docs/14 §5.1 L290-L291 的两个入口只在语义上分工）：
 *   · L3 / C4：`inScope()` 判稿件 + 目标栏目
 *   · C3：当前为 `published` 时**先落 `ArticleVersion` 快照**
 *   · 边 8（`docs/13` §7.2 L139）：任意状态 → `draft`
 *   · C1：同事务写 `AuditRecord`（`step=submit`，`fromStatus` 原状态，`toStatus=draft`）
 *   · A30：`content` 写入前 `sanitizeHtml()`
 */
async function writeArticle(
  input: ArticleWriteInput & { id: string },
): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();

  if (!scope.ok) {
    return scope.fail;
  }

  const { session } = scope;

  if (isSlugReservedForAdmin(input.slug)) {
    return fail("SLUG_RESERVED", "该 slug 是系统保留字，请换一个。", "slug");
  }

  const parsed = articleFormSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION_FAILED", firstIssueMessage(parsed.error.issues));
  }
  const values = parsed.data;

  const article = await prisma.article.findFirst({
    where: { id: input.id, deletedAt: null },
    select: {
      id: true,
      siteId: true,
      slug: true,
      title: true,
      content: true,
      status: true,
      createdById: true,
    },
  });
  if (!article) {
    return fail("NOT_FOUND", "文章不存在或已删除。");
  }

  // L3 / C4
  const scopeError = inScope(
    session.role,
    session.siteId,
    { siteId: article.siteId, createdById: article.createdById },
    session.userId,
  );
  if (scopeError) {
    return fail("FORBIDDEN", "无权编辑该文章。");
  }

  // 目标栏目也必须在同一数据范围内（不允许把本站稿子挪进他站栏目）
  const channel = await prisma.channel.findFirst({
    where: { id: values.channelId, status: true },
    select: { id: true, siteId: true },
  });
  if (!channel) {
    return fail("VALIDATION_FAILED", "所选栏目不存在。", "channelId");
  }
  const channelScope = inScope(
    session.role,
    session.siteId,
    { siteId: channel.siteId, createdById: session.userId },
    session.userId,
  );
  if (channelScope) {
    return fail("FORBIDDEN", "无权把文章放到该栏目。");
  }

  // `@@unique([siteId, slug])`（schema.prisma L167）—— slug 变了才查
  if (values.slug !== article.slug) {
    const taken = await prisma.article.findFirst({
      where: { siteId: article.siteId, slug: values.slug },
      select: { id: true },
    });
    if (taken) {
      return fail("SLUG_TAKEN", "该 slug 在本站点已存在。", "slug");
    }
  }

  if (!isArticleStatus(article.status)) {
    return fail("INVALID_STATE_TRANSITION", "文章当前状态异常，无法保存。");
  }
  const fromStatus: ArticleStatus = article.status;
  // 边 8：任意状态 → draft（`transition.to` 恒为 "draft"；草稿→草稿不落快照）
  const transition = transitionSaveDraft(fromStatus);
  if (!transition.ok) {
    return fail("INVALID_STATE_TRANSITION", "当前状态不允许保存为草稿。");
  }

  const content = cleanContent(values.content);

  try {
    await prisma.$transaction(async (tx) => {
      // C3（docs/13 §7.4 L199）：published 编辑前先落快照（版本号 = 当前最大值 + 1）
      if (fromStatus === "published") {
        const latest = await tx.articleVersion.findFirst({
          where: { articleId: article.id },
          orderBy: { version: "desc" },
          select: { version: true },
        });

        await tx.articleVersion.create({
          data: {
            articleId: article.id,
            version: (latest?.version ?? 0) + 1,
            title: article.title,
            content: article.content,
            // `editor` / `operatorName` 均为非空（schema.prisma L218 / L240）
            editor: session.userLabel,
            userId: session.userId,
          },
        });
      }

      await tx.article.update({
        where: { id: article.id },
        data: {
          channelId: channel.id,
          title: values.title,
          slug: values.slug,
          summary: nullableText(values.summary),
          content,
          cover: nullableText(values.cover),
          status: transition.to,
        },
      });

      // C1：状态变更必须留痕（非空字段 operatorName / role 见 schema.prisma L240 / L244）
      await tx.auditRecord.create({
        data: {
          articleId: article.id,
          step: transition.step,
          fromStatus: transition.from,
          toStatus: transition.to,
          operatorName: session.userLabel,
          userId: session.userId,
          role: session.role,
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return fail("SLUG_TAKEN", "该 slug 在本站点已存在。", "slug");
    }
    throw error;
  }

  return { ok: true, data: { id: article.id } };
}

/** 更新文章（编辑页「保存草稿」走这里；`published` 会先落快照，见 C3） */
export async function updateArticle(
  input: ArticleWriteInput & { id: string },
): Promise<Ok<{ id: string }> | Fail> {
  return writeArticle(input);
}

/**
 * 保存草稿（docs/14 §5.1 L290）。与 `updateArticle` **共用实现**：
 * 「草稿 → 草稿」天然不落快照；若当前是 `published`，C3 要求先落快照，故此处不豁免。
 */
export async function saveArticleDraft(
  input: ArticleWriteInput & { id: string },
): Promise<Ok<{ id: string }> | Fail> {
  return writeArticle(input);
}
