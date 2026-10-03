import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTableDate } from "@/lib/date";

import {
  updateFormDataStatus,
  type FormDataListItem,
  type FormListItem,
} from "@/app/admin/forms/actions";

/**
 * 表单提交数据表（M5-5a）
 * ============================================================================
 * · **列是动态的**：`提交时间 / 状态 / IP` + `Form.fields[].label`（中文表头来自 DB 的字段定义，
 *   seed 形状见 `prisma/seed.ts` L1478-L1504）
 * · 单元格取值 = `JSON.parse(FormData.data)[field.name]`，**缺失字段回落 `—`**
 *   （真实提交可能少填可选字段；seed 的 30 条与字段一一对应）
 * · 行内状态切换走 `<form action={serverAction}>`（**不需要**客户端组件，
 *   同 `media-table.tsx` L19/L28-L44 的范式）：适配层把 `FormData` 收敛成契约入参
 * · 空态由调用方传 `emptyHint`（页面区分"全部为空"与"该状态为空"）
 */

/** 表单适配层：`<form action>` 只接受 `(formData: FormData) => …`，故包一层（同 `media-table.tsx` L28） */
async function updateStatusForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const formId = String(formData.get("formId") ?? "");
  if (!id || !status) {
    return;
  }

  const result = await updateFormDataStatus({ id, status });
  revalidatePath("/admin/forms");

  if (!result.ok) {
    // `redirect()` 必须放在 try/catch 之外（它靠抛异常工作）
    redirect(
      `/admin/forms?formId=${encodeURIComponent(formId)}&error=${encodeURIComponent(result.message)}`,
    );
  }
}

/** 状态 → 中文标签 + 徽章样式（`new` / `read` / `archived`，schema.prisma L401-L402） */
const STATUS_LABELS: Record<string, string> = {
  new: "未读",
  read: "已读",
  archived: "已归档",
};

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
  new: { value: "read", label: "标记已读" },
  read: { value: "archived", label: "归档" },
  archived: { value: "new", label: "恢复未读" },
};

/** 单元格值 → 展示字符串（对象/数组用 JSON 兜底，避免 `[object Object]`） */
function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function FormDataTable({
  form,
  items,
  status,
  emptyHint = "暂无提交数据。",
}: {
  form: FormListItem;
  items: readonly FormDataListItem[];
  status?: string;
  emptyHint?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyHint}</p>;
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>提交时间</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>IP</TableHead>
            {/* 动态列：中文表头取 `Form.fields[].label`（DB 字段定义） */}
            {form.fields.map((field) => (
              <TableHead key={field.name}>{field.label}</TableHead>
            ))}
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const next = NEXT_STATUS[item.status];
            return (
              <TableRow key={item.id} data-slot="form-data-item">
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatTableDate(item.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={item.status === "new" ? "default" : "secondary"}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{item.ip ?? "—"}</TableCell>
                {form.fields.map((field) => (
                  <TableCell key={field.name} className="max-w-xs truncate">
                    {cellText(item.data[field.name])}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {next ? (
                    <form action={updateStatusForm} className="inline-flex">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="formId" value={form.id} />
                      <input type="hidden" name="status" value={next.value} />
                      <button
                        type="submit"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {next.label}
                      </button>
                    </form>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        {status ? `当前筛选：${status}` : "当前筛选：全部"}
        （状态流转：未读 → 已读 → 已归档，可恢复未读）
      </p>
    </div>
  );
}
