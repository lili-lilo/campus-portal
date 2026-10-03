import * as ExcelJS from "exceljs";

import { requireSession } from "@/lib/actions-shared";
import { dateKeyOf, formatTableDate } from "@/lib/date";
import { MAX_EXPORT_ROWS, buildXlsxResponse, failResponse } from "@/lib/excel";
import { can, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * `GET /api/export/form-data?formId=&status=`（M5-5a / `docs/14` §6.2 L629 + L632）
 * ============================================================================
 * · **鉴权自带两层**：`proxy.ts` 的 matcher **排除 `api`**（该文件 L53-L61，注释 L56 明写
 *   "api → Route Handler 自行鉴权"）⇒ 本端点必须自己 L1 + L2
 *     - L1 `requireSession()`（会话 + 角色收窄）
 *     - L2 `can(role, "form.manage")`（`docs/14` L629 的权限列）
 * · **数据范围**：`super_admin` 全站 / 其余锁本站；`Form.siteId IS NULL`（全站通用表单）对本站放行
 * · **行数上限**：`docs/14` L632 —— 单次 ≤ **10000 行**，超出 → **`VALIDATION_FAILED`(400)**。
 *   实现为 **先 `count` 再 `findMany`**（避免先拉十万行进内存）；上限常量单一定义在 `lib/excel.ts`
 * · **列**：`提交时间 / 状态 / IP` + `Form.fields[].label`（中文表头取自 DB 字段定义）；
 *   日期走 `lib/date.ts` 的 `formatTableDate`（**Asia/Shanghai**，`docs/14` L632 + A32）
 * · **响应**：`.xlsx`（`buildXlsxResponse`：xlsx MIME + RFC 6266 双形式 `Content-Disposition` +
 *   `Cache-Control: no-store`）；失败一律 JSON 信封（`failResponse`，`docs/14` §2.1）
 */

/** 数据状态 → 导出用中文（与页面 `form-data-table.tsx` 的标签一致） */
const STATUS_LABELS: Record<string, string> = {
  new: "未读",
  read: "已读",
  archived: "已归档",
};

const FORM_DATA_STATUSES = ["new", "read", "archived"] as const;

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const formId = (searchParams.get("formId") ?? "").trim();
  const rawStatus = (searchParams.get("status") ?? "").trim();
  const status = (FORM_DATA_STATUSES as readonly string[]).includes(rawStatus)
    ? rawStatus
    : undefined;

  // L1
  const scope = await requireSession();
  if (!scope.ok) {
    return failResponse(scope.fail.code === "UNAUTHORIZED" ? 401 : 403, scope.fail);
  }
  const { session } = scope;

  // L2（docs/14 L629：form.manage）
  if (!can(session.role, "form.manage")) {
    return failResponse(403, { code: "FORBIDDEN", message: "无权导出表单数据。" });
  }

  if (!formId) {
    return failResponse(400, {
      code: "VALIDATION_FAILED",
      message: "缺少表单标识。",
      field: "formId",
    });
  }

  // 表单可见性 + 数据范围（与 `admin/forms/actions.ts` 的 formVisibility 同口径）
  const superAdmin = isSuperAdmin(session.role);
  const scopedSiteId = session.siteId;
  const form = await prisma.form.findFirst({
    where: {
      id: formId,
      ...(superAdmin ? {} : { OR: [{ siteId: scopedSiteId }, { siteId: null }] }),
    },
    select: { id: true, name: true, fields: true },
  });
  if (!form) {
    return failResponse(404, { code: "NOT_FOUND", message: "表单不存在或不在数据范围内。" });
  }

  const where = { formId: form.id, ...(status ? { status } : {}) };

  // 先 count：超限直接 400，不把数据拉进内存（docs/14 L632）
  const total = await prisma.formData.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    return failResponse(400, {
      code: "VALIDATION_FAILED",
      message: `导出上限 ${MAX_EXPORT_ROWS} 行（当前 ${total} 行），请收窄筛选。`,
      field: "status",
    });
  }

  const rows = await prisma.formData.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: { id: true, data: true, status: true, ip: true, createdAt: true },
  });

  const formFields = parseFields(form.fields);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XX大学站群系统";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("数据");
  sheet.columns = [
    { header: "提交时间", key: "createdAt", width: 20 },
    { header: "状态", key: "status", width: 10 },
    { header: "IP", key: "ip", width: 16 },
    // 业务字段：中文表头取 DB 的 `Form.fields[].label`
    ...formFields.map((field) => ({ header: field.label, key: field.name, width: 24 })),
  ];

  for (const row of rows) {
    const payload = parseData(row.data);
    const record: Record<string, string> = {
      createdAt: formatTableDate(row.createdAt),
      status: STATUS_LABELS[row.status] ?? row.status,
      ip: row.ip ?? "",
    };
    for (const field of formFields) {
      record[field.name] = cellText(payload[field.name]);
    }
    sheet.addRow(record);
  }

  // 文件名日期按 **Asia/Shanghai**（`dateKeyOf` 是 docs/13 §5.3 的唯一实现，`lib/date.ts` L57）
  const dateKey = dateKeyOf(new Date());
  return buildXlsxResponse({
    workbook,
    filename: `${form.name}-数据-${dateKey.replaceAll("-", "")}.xlsx`,
    asciiFilename: `form-data-${dateKey.replaceAll("-", "")}.xlsx`,
  });
}

/** `Form.fields` 的字段定义（与 `admin/forms/actions.ts` 同口径；此处只需 name/label） */
function parseFields(raw: string): { name: string; label: string }[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map((item) => ({
        name: typeof item.name === "string" ? item.name : "",
        label:
          typeof item.label === "string"
            ? item.label
            : typeof item.name === "string"
              ? item.name
              : "",
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
}

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

/** 单元格值 → 字符串（缺值给空串，Excel 里不显示 `—` 占位） */
function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}
