"use server";

import { revalidatePath } from "next/cache";

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  emptyPage,
  fail,
  parsePositiveInt,
  requireSession,
  type Fail,
  type Ok,
  type Paginated,
  type SessionContext,
} from "@/lib/actions-shared";
import { can, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * 表单后台取数（M5-5a / `docs/14` §5.5 L430-L441、`docs/15` §9.1 L432）
 * ============================================================================
 * 本批只做 **M5 DoD 需要的三个**（`docs/16` §4.2 M5 L329「表单后台查看 + 导出 .xlsx」）：
 *   · `listForms`（L436）—— 表单列表
 *   · `listFormData`（L440）—— 某表单的数据列表（分页 + 状态筛选）
 *   · `updateFormDataStatus`（L441）—— 标记 `new` / `read` / `archived`
 * `createForm` / `updateForm` / `deleteForm`（`docs/14` L437-L439）**留 M6**（需要字段定义编辑器，M5 字面不含）。
 *
 * 鉴权：**每个 Action 都是 L1 + L2 两层**（与 `articles` / `media` 一致）
 *   · L1 `requireSession()`（会话 + 角色收窄，来自 `@/lib/actions-shared`）
 *   · L2 `can(role, "form.manage")`（`docs/14` §5.5 六行的权限列全是它）
 *     —— 实测该码只有 `site_admin` / `super_admin` 持有（`lib/permissions.ts` L87-L100 editor 12 条无、
 *     L103-L114 auditor 10 条无、L119-L121 site_admin = 全码减 4 ⇒ 有）
 *
 * 数据范围（L3）：`super_admin` → 入参 siteId（缺省 = 全站）；其余角色 → **强制锁本站**。
 * **`Form.siteId` 可空 = 全站通用表单**（schema.prisma L380-L381）⇒ 本站角色读取时把
 * `siteId IS NULL` 一并放行（与 `Media.siteId` 的"全站共享素材"同口径）。
 *
 * ⚠ 本文件不写 `AuditRecord`：`updateFormDataStatus` 是**数据标记**、不是状态机流转
 * （`docs/13` §7.2 的六态机只覆盖 `Article`）。
 */

/** `Form.fields` 的一条字段定义（seed L1478-L1504 的形状） */
export type FormFieldDef = {
  name: string;
  label: string;
  type: string;
  required: boolean;
};

/** 表单列表一项 */
export type FormListItem = {
  id: string;
  name: string;
  /** 字段定义（已解析，供页面动态出列与导出取中文表头） */
  fields: FormFieldDef[];
  fieldCount: number;
  status: boolean;
  /** `_count.data`：该表单的提交条数 */
  submissionCount: number;
  siteId: string | null;
  createdAt: Date;
};

/** 表单数据一项（`data` 已解析为对象） */
export type FormDataListItem = {
  id: string;
  data: Record<string, unknown>;
  status: string;
  ip: string | null;
  createdAt: Date;
};

/**
 * 允许的数据状态（`docs/14` L441 / schema.prisma L401-L402）。
 *
 * ⚠ **不导出**：本文件是 `"use server"` 文件，**只能导出 async 函数**
 * （导出一个运行时常量会在 build 时报 `A "use server" file can only export async functions, found object`
 * —— M5-5a 首轮 build 实测踩到，已修）。类型导出不受限（编译期擦除）。
 */
const FORM_DATA_STATUSES = ["new", "read", "archived"] as const;

function isFormDataStatus(value: unknown): value is (typeof FORM_DATA_STATUSES)[number] {
  return typeof value === "string" && (FORM_DATA_STATUSES as readonly string[]).includes(value);
}

/** `Form.fields`（JSON 字符串）→ 字段定义数组；非法 JSON / 非数组一律回落 `[]`（不抛，页面照常渲染） */
function parseFields(raw: string): FormFieldDef[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        name: typeof item.name === "string" ? item.name : "",
        label: typeof item.label === "string" ? item.label : String(item.name ?? ""),
        type: typeof item.type === "string" ? item.type : "text",
        required: item.required === true,
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
}

/** `FormData.data`（JSON 字符串）→ 对象；非法 JSON / 非对象回落 `{}` */
function parseData(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/** 入参 `siteId` 解析：`super_admin` 可用入参收窄（缺省全站）；其余角色一律锁本站 */
function scopeSiteIdOf(session: SessionContext, requested?: string): string | null {
  return isSuperAdmin(session.role) ? (requested ?? null) : session.siteId;
}

/** `Form` 的可见性：本站角色可读「本站表单」+「全站通用表单（siteId IS NULL）」 */
function formVisibility(siteId: string | null) {
  return siteId ? { OR: [{ siteId }, { siteId: null }] } : {};
}

/**
 * 表单列表（`docs/14` L436）。
 * 排序：`createdAt asc`（seed 的三个表单顺序稳定：招生咨询 / 意见反馈 / 活动报名）。
 */
export async function listForms(input: {
  siteId?: string;
  page?: string;
  pageSize?: string;
}): Promise<Ok<Paginated<FormListItem>> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "form.manage")) {
    return fail("FORBIDDEN", "无权查看表单。");
  }

  const page = parsePositiveInt(input.page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
  const pageSize = parsePositiveInt(input.pageSize, {
    min: 1,
    max: MAX_PAGE_SIZE,
    fallback: DEFAULT_PAGE_SIZE,
  });

  const siteId = scopeSiteIdOf(session, input.siteId);
  if (!isSuperAdmin(session.role) && !siteId) {
    return { ok: true, data: emptyPage<FormListItem>(page, pageSize) };
  }

  const where = { ...formVisibility(siteId) };

  // 只读并行查询：Promise.all 取代 $transaction（无需原子性；避免 Supabase 高延迟下事务启动超时）
  const [rows, total] = await Promise.all([
    prisma.form.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        fields: true,
        status: true,
        siteId: true,
        createdAt: true,
        _count: { select: { data: true } },
      },
    }),
    prisma.form.count({ where }),
  ]);

  const items: FormListItem[] = rows.map((row) => {
    const fields = parseFields(row.fields);
    return {
      id: row.id,
      name: row.name,
      fields,
      fieldCount: fields.length,
      status: row.status,
      submissionCount: row._count.data,
      siteId: row.siteId,
      createdAt: row.createdAt,
    };
  });

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

/**
 * 某表单的数据列表（`docs/14` L440）：`createdAt desc`（最新提交在前），可按状态筛选。
 *
 * 先做**范围校验**：表单不存在 / 不在数据范围内 → `NOT_FOUND`（不泄露存在性，docs/14 §8 A7 同口径）。
 */
export async function listFormData(input: {
  formId: string;
  status?: string;
  page?: string;
  pageSize?: string;
}): Promise<Ok<Paginated<FormDataListItem>> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "form.manage")) {
    return fail("FORBIDDEN", "无权查看表单数据。");
  }

  const formId = input.formId.trim();
  if (!formId) {
    return fail("VALIDATION_FAILED", "缺少表单标识。", "formId");
  }

  const form = await prisma.form.findFirst({
    where: { id: formId, ...formVisibility(scopeSiteIdOf(session, undefined)) },
    select: { id: true },
  });
  if (!form) {
    return fail("NOT_FOUND", "表单不存在或不在数据范围内。");
  }

  const page = parsePositiveInt(input.page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
  const pageSize = parsePositiveInt(input.pageSize, {
    min: 1,
    max: MAX_PAGE_SIZE,
    fallback: DEFAULT_PAGE_SIZE,
  });

  const status = isFormDataStatus(input.status) ? input.status : undefined;
  const where = { formId, ...(status ? { status } : {}) };

  // 只读并行查询：Promise.all 取代 $transaction（无需原子性；避免 Supabase 高延迟下事务启动超时）
  const [rows, total] = await Promise.all([
    prisma.formData.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, data: true, status: true, ip: true, createdAt: true },
    }),
    prisma.formData.count({ where }),
  ]);

  const items: FormDataListItem[] = rows.map((row) => ({
    id: row.id,
    data: parseData(row.data),
    status: row.status,
    ip: row.ip,
    createdAt: row.createdAt,
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

/**
 * 标记数据状态（`docs/14` L441）：`new` / `read` / `archived`。
 * 白名单外 → `VALIDATION_FAILED`(400)；记录不在范围内 → `NOT_FOUND`。
 * **不写 `AuditRecord`**（非状态机动作，见文件头）。
 */
export async function updateFormDataStatus(input: {
  id: string;
  status: string;
}): Promise<Ok<{ id: string }> | Fail> {
  const scope = await requireSession();
  if (!scope.ok) {
    return scope.fail;
  }
  const { session } = scope;

  if (!can(session.role, "form.manage")) {
    return fail("FORBIDDEN", "无权修改表单数据状态。");
  }

  if (!isFormDataStatus(input.status)) {
    return fail("VALIDATION_FAILED", "状态只能是 new / read / archived。", "status");
  }

  const record = await prisma.formData.findFirst({
    where: { id: input.id },
    select: { id: true, form: { select: { siteId: true } } },
  });
  if (!record) {
    return fail("NOT_FOUND", "数据不存在。");
  }

  // L3 数据范围：本站角色只能动「本站表单」或「全站通用表单」的数据
  const formSiteId = record.form.siteId;
  const scopedSiteId = scopeSiteIdOf(session, undefined);
  if (!isSuperAdmin(session.role) && formSiteId !== null && formSiteId !== scopedSiteId) {
    return fail("FORBIDDEN", "无权修改该表单数据。");
  }

  await prisma.formData.update({ where: { id: record.id }, data: { status: input.status } });
  revalidatePath("/admin/forms");

  return { ok: true, data: { id: record.id } };
}
