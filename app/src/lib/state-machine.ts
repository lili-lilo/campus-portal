/**
 * 文章状态机 —— **纯函数**实现（无 Prisma 依赖，供 L1 单测在无数据库环境下运行）
 *
 * 规格来源：
 *   · docs/13 §7.1 六态定义
 *   · docs/13 §7.2 八条转移边（含每边的 `AuditRecord.step` 与可操作角色）
 *   · docs/13 §7.4 约束 C1（留痕）/ C2（服务端显式比对 fromStatus）
 *
 * 设计约定：
 *   · 只表达"状态 → 状态"的合法性与应写的 step，**不碰数据库**
 *   · 角色/数据范围（C4、L2/L3）在 `@/lib/permissions`，本文件只给"该边可操作角色"清单
 */

export const ARTICLE_STATUSES = [
  "draft",
  "pending_first",
  "pending_final",
  "published",
  "rejected",
  "withdrawn",
] as const;

export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/** `AuditRecord.step` 取值（docs/13 §7.4 收窄为 6 个） */
export type AuditStep = "submit" | "review" | "approve" | "reject" | "publish" | "withdraw";

export type TransitionAction =
  | "submitForReview"
  | "reviewArticle:pass"
  | "reviewArticle:reject"
  | "publishArticle"
  | "withdrawArticle"
  | "saveArticleDraft";

export type EdgeRole = "editor" | "site_admin" | "super_admin" | "auditor";

export type TransitionErrorCode = "INVALID_STATE_TRANSITION";

export type TransitionResult =
  | { ok: true; from: ArticleStatus; to: ArticleStatus; step: AuditStep }
  | { ok: false; code: TransitionErrorCode; from: ArticleStatus };

type Transition = {
  action: TransitionAction;
  /** `"*"` 只用于边 8（任意状态 → draft） */
  from: ArticleStatus | "*";
  to: ArticleStatus;
  step: AuditStep;
  /** docs/13 §7.2 的「可操作角色」列（站点/本人范围由 L3 判定） */
  roles: readonly EdgeRole[];
};

/** 八条边（docs/13 §7.2）——顺序与文档表格一致，便于对照 */
export const ARTICLE_TRANSITIONS: readonly Transition[] = [
  {
    action: "submitForReview",
    from: "draft",
    to: "pending_first",
    step: "submit",
    roles: ["editor", "site_admin", "super_admin"],
  },
  {
    action: "reviewArticle:pass",
    from: "pending_first",
    to: "pending_final",
    step: "review",
    roles: ["auditor", "site_admin", "super_admin"],
  },
  {
    action: "publishArticle",
    from: "pending_final",
    to: "published",
    step: "publish",
    roles: ["auditor", "site_admin", "super_admin"],
  },
  {
    action: "reviewArticle:reject",
    from: "pending_first",
    to: "rejected",
    step: "reject",
    roles: ["auditor", "site_admin", "super_admin"],
  },
  {
    action: "reviewArticle:reject",
    from: "pending_final",
    to: "rejected",
    step: "reject",
    roles: ["auditor", "site_admin", "super_admin"],
  },
  {
    action: "withdrawArticle",
    from: "published",
    to: "withdrawn",
    step: "withdraw",
    roles: ["auditor", "site_admin", "super_admin"],
  },
  {
    action: "submitForReview",
    from: "withdrawn",
    to: "pending_first",
    step: "submit",
    roles: ["editor", "site_admin", "super_admin"],
  },
  {
    action: "saveArticleDraft",
    from: "*",
    to: "draft",
    step: "submit",
    roles: ["editor", "site_admin", "super_admin"],
  },
];

function resolve(action: TransitionAction, from: ArticleStatus): TransitionResult {
  const hit = ARTICLE_TRANSITIONS.find(
    (edge) => edge.action === action && (edge.from === "*" || edge.from === from),
  );

  if (!hit) {
    return { ok: false, code: "INVALID_STATE_TRANSITION", from };
  }

  return { ok: true, from, to: hit.to, step: hit.step };
}

/** 边 1 / 边 7：提交初审（`withdrawn` 可原样重提） */
export function submitForReview(from: ArticleStatus): TransitionResult {
  return resolve("submitForReview", from);
}

/** 边 2（pass）/ 边 4·5（reject） */
export function reviewArticle(from: ArticleStatus, verdict: "pass" | "reject"): TransitionResult {
  return resolve(verdict === "pass" ? "reviewArticle:pass" : "reviewArticle:reject", from);
}

/** 边 3 */
export function publishArticle(from: ArticleStatus): TransitionResult {
  return resolve("publishArticle", from);
}

/** 边 6 */
export function withdrawArticle(from: ArticleStatus): TransitionResult {
  return resolve("withdrawArticle", from);
}

/** 边 8：任意状态 → `draft`（保存编辑；`published` 走此边前须先落版本快照，约束 C3） */
export function saveArticleDraft(from: ArticleStatus): TransitionResult {
  return resolve("saveArticleDraft", from);
}

/** 是否存在**某个**动作能把 `from` 变成 `to` */
export function canTransition(from: ArticleStatus, to: ArticleStatus): boolean {
  return ARTICLE_TRANSITIONS.some(
    (edge) => (edge.from === "*" || edge.from === from) && edge.to === to,
  );
}

/** 某个动作在给定状态下允许哪些角色（L2 的角色维度；站点/本人范围见 L3） */
export function rolesForAction(action: TransitionAction, from: ArticleStatus): readonly EdgeRole[] {
  const hit = ARTICLE_TRANSITIONS.find(
    (edge) => edge.action === action && (edge.from === "*" || edge.from === from),
  );
  return hit?.roles ?? [];
}

/**
 * 约束 C2：服务端必须显式比对「客户端传来的 fromStatus」与「库中当前状态」。
 * 返回 `null` 表示一致；否则返回 `INVALID_STATE_TRANSITION`。
 */
export function checkExpectedStatus(
  fromStatus: ArticleStatus,
  currentStatus: ArticleStatus,
): TransitionErrorCode | null {
  return fromStatus === currentStatus ? null : "INVALID_STATE_TRANSITION";
}

export function isArticleStatus(value: string): value is ArticleStatus {
  return (ARTICLE_STATUSES as readonly string[]).includes(value);
}
