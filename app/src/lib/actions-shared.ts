import { auth } from "@/lib/auth";
import { ROLE_CODES, type Role } from "@/lib/permissions";

/**
 * Server Action / Route Handler 的公共骨架（T3.6a 抽出）
 * ============================================================================
 * **抽取触发点**：用户裁决「等第 3 处私有 `requireSession` 出现再抽」—— 三处分别是
 *   ① `app/src/app/admin/articles/actions.ts`（T3.5 起）
 *   ② `app/src/app/admin/recycle/actions.ts`（M4 批次 2a）
 *   ③ `app/src/app/api/media/upload/route.ts`（T3.6a：`proxy.ts` 的 matcher 排除 `api`，
 *      Route Handler 必须自己 L1）
 * 前两处的实现**逐字一致**，故抽取为零语义变化；第 ③ 处直接用抽出后的版本。
 *
 * **刻意不抽**（各域差异太大）：
 *   · `can` / `inScope` —— 每个 Action 的权限码与数据范围规则都不同，留在调用点
 *   · `scopeSiteIdOf` —— 只有文章域在用（媒体域的"全站共享"规则不同）
 *   · 信封类型已在此**统一定义**：`docs/14` §2.1 的 `Ok<T>` / `Fail`；各域通过
 *     `export type { … } from "@/lib/actions-shared"` 再导出，保持既有 import 路径可用
 */

/** 统一错误码（`docs/14` §2.2；是各域旧联合的**并集**） */
export type ApiErrorCode =
  | "UNAUTHORIZED" // 401
  | "FORBIDDEN" // 403
  | "NOT_FOUND" // 404
  | "VALIDATION_FAILED" // 400
  | "SLUG_RESERVED" // 409
  | "SLUG_TAKEN" // 409
  | "INVALID_STATE_TRANSITION" // 400
  | "CONFLICT" // 409
  | "SOFT_DELETED" // 409 —— 资源在回收站中
  | "PAYLOAD_TOO_LARGE" // 413 —— 上传 > 10MB
  /** 415 —— 上传类型不在白名单（T3.6a 新增；⚠ `docs/14` §2.2 待补该行） */
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INTERNAL_ERROR"; // 500

export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; code: ApiErrorCode; message: string; field?: string };

export type Paginated<T> = {
  items: T[];
  page: number;
  /** 从 1 开始 */
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
};

export type SessionContext = {
  userId: string;
  /** 展示用名（`AuditRecord.operatorName` / `ArticleVersion.editor` / `Media.uploader` 用，均非空） */
  userLabel: string;
  role: Role;
  siteId: string | null;
};

export type SessionResult = { ok: true; session: SessionContext } | { ok: false; fail: Fail };

/** 分页默认值（`docs/14` §2.3：默认 20，上限 100） */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function fail(code: ApiErrorCode, message: string, field?: string): Fail {
  return field ? { ok: false, code, message, field } : { ok: false, code, message };
}

/** `session.user.role`（`unknown`）→ `Role` 的类型谓词（零 `as` 强转） */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && ROLE_CODES.some((code) => code === value);
}

/** L1：会话 + 角色收窄（角色不在 4 个已知值内 → `FORBIDDEN`） */
export async function requireSession(): Promise<SessionResult> {
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

/**
 * 分页入参收敛（`docs/14` §2.3）：只接受**正整数字符串**；
 * 非法（`0` / `-1` / `1.5` / `abc` / 空串）→ `fallback`；合法则夹到 `[min, max]`。
 */
export function parsePositiveInt(
  value: string | undefined,
  options: { min: number; max: number; fallback: number },
): number {
  if (!value) {
    return options.fallback;
  }

  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return options.fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed)) {
    return options.fallback;
  }

  return Math.min(Math.max(parsed, options.min), options.max);
}

export function emptyPage<T>(page: number, pageSize: number): Paginated<T> {
  return { items: [], page, pageSize, total: 0, totalPages: 1, hasNext: false };
}
