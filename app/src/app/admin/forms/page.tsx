import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormDataTable } from "@/components/admin/form-data-table";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { formatTableDate } from "@/lib/date";
import { MAX_EXPORT_ROWS } from "@/lib/excel";
import { ROLE_CODES, can, type Role } from "@/lib/permissions";

import { listFormData, listForms, type FormListItem } from "./actions";

export const metadata: Metadata = { title: "表单管理" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/** `session.user.role`（`string`）→ `Role`（零 `as` 强转；同 T3.1 `admin-sidebar.tsx`） */
function isRole(value: string): value is Role {
  return ROLE_CODES.some((code) => code === value);
}

/**
 * 表单管理（M5-5a）—— `docs/15` §9.1 **L432** 的 `/admin/forms` 行
 * ============================================================================
 * · 页面 gate = **`menu.forms`**（与 sidebar 同码；`editor`/`auditor` 访问 → 404）
 * · 读数据源 = `listForms` + `listFormData`（`docs/14` L205 / L436 / L440），
 *   Action 层另有 **L2 `form.manage`**（两层鉴权，与 `docs/14` §5.5 权限列一致）
 * · **单页 + 查询参数**（M5-5a 裁决 Q6）：`?formId=` 选中表单后显示其数据表，
 *   `?status=` 状态筛选、`?page=` 分页 —— 全部走原生 GET（零客户端 JS），
 *   与 `/admin/articles` 的筛选/分页口径一致
 * · **导出** = 普通 `<a href="/api/export/form-data?…">`（Route Handler 自鉴权；
 *   `proxy.ts` matcher 排除 `api`，见该文件 L56 注释）⇒ 不经过任何客户端逻辑
 * · 文案硬编码中文：沿 T3.2 裁决 6（后台不做 i18n）
 */
export default async function FormsPage({
  searchParams,
}: {
  searchParams: Promise<{ formId?: string; status?: string; page?: string; error?: string }>;
}) {
  const {
    formId: rawFormId,
    status: rawStatus,
    page: rawPage,
    error: rawError,
  } = await searchParams;

  const session = await auth();
  const role = session?.user.role;

  if (!role || !isRole(role) || !can(role, "menu.forms")) {
    notFound();
  }

  const siteId = session?.user.siteId ?? undefined;
  const formsResult = await listForms({ siteId, page: "1", pageSize: "20" });

  if (!formsResult.ok) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">表单管理</h1>
        <p role="alert" className={ALERT_CLASS}>
          {formsResult.message}
        </p>
      </div>
    );
  }

  const forms = formsResult.data.items;
  const formId = rawFormId && forms.some((item) => item.id === rawFormId) ? rawFormId : undefined;
  const selected: FormListItem | undefined = forms.find((item) => item.id === formId);
  const status = rawStatus?.trim() || undefined;

  const dataResult = formId
    ? await listFormData({ formId, status, page: rawPage, pageSize: "20" })
    : null;

  /** 保留 `formId` / `status` 的分页链接（后台通用范式，见 `/admin/articles` L132-L165） */
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (formId) params.set("formId", formId);
    if (status) params.set("status", status);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/admin/forms?${query}` : "/admin/forms";
  };

  const exportHref = formId
    ? `/api/export/form-data?formId=${encodeURIComponent(formId)}${
        status ? `&status=${encodeURIComponent(status)}` : ""
      }`
    : null;

  const disabledClass = `${buttonVariants({ variant: "outline", size: "sm" })} pointer-events-none opacity-50`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">表单管理</h1>
        <p className="text-sm text-muted-foreground">
          共 {formsResult.data.total} 个表单（权限：menu.forms / form.manage）。导出上限{" "}
          {MAX_EXPORT_ROWS} 行（超出请收窄状态筛选）。
        </p>
      </div>

      {rawError ? (
        <p role="alert" className={ALERT_CLASS}>
          {rawError}
        </p>
      ) : null}

      {forms.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无表单。</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>表单名称</TableHead>
              <TableHead>字段数</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>提交数据</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forms.map((item) => {
              const active = item.id === formId;
              return (
                <TableRow key={item.id} data-slot="form-item">
                  <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.fieldCount}</TableCell>
                  <TableCell>
                    <Badge variant={item.status ? "secondary" : "outline"}>
                      {item.status ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.submissionCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTableDate(item.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      className={buttonVariants({
                        variant: active ? "default" : "outline",
                        size: "sm",
                      })}
                      href={`/admin/forms?formId=${encodeURIComponent(item.id)}`}
                    >
                      {active ? "正在查看" : "查看数据"}
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {selected && dataResult ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{selected.name} · 提交数据</h2>
              <p className="text-sm text-muted-foreground">
                {dataResult.ok
                  ? `共 ${dataResult.data.total} 条${status ? `（状态：${status}）` : ""} · 最新提交在前`
                  : "取数失败"}
              </p>
            </div>

            {exportHref ? (
              // 导出是 Route Handler（/api/…）+ 浏览器原生下载 ⇒ 用裸 <a>，不走 next/link
              <a href={exportHref} className={buttonVariants({ variant: "default", size: "sm" })}>
                导出 .xlsx
              </a>
            ) : null}
          </div>

          {/* 状态筛选：原生 GET 表单（零客户端 JS），按钮 `name="status"` 的值即提交值 */}
          <form method="get" action="/admin/forms" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="formId" value={formId} />
            {[
              { value: "", label: "全部" },
              { value: "new", label: "未读" },
              { value: "read", label: "已读" },
              { value: "archived", label: "已归档" },
            ].map((option) => {
              const active = (status ?? "") === option.value;
              return (
                <button
                  key={option.value || "all"}
                  type="submit"
                  name="status"
                  value={option.value}
                  aria-pressed={active}
                  className={buttonVariants({
                    variant: active ? "default" : "outline",
                    size: "sm",
                  })}
                >
                  {option.label}
                </button>
              );
            })}
          </form>

          {!dataResult.ok ? (
            <p role="alert" className={ALERT_CLASS}>
              {dataResult.message}
            </p>
          ) : (
            <FormDataTable
              form={selected}
              items={dataResult.data.items}
              status={status}
              emptyHint={status ? "该状态下暂无提交数据。" : "暂无提交数据。"}
            />
          )}

          {dataResult.ok && dataResult.data.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                第 {dataResult.data.page} / {dataResult.data.totalPages} 页
              </p>
              <div className="flex items-center gap-2">
                {dataResult.data.page > 1 ? (
                  <Link
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    href={pageHref(dataResult.data.page - 1)}
                  >
                    上一页
                  </Link>
                ) : (
                  <span className={disabledClass} aria-disabled="true">
                    上一页
                  </span>
                )}
                {dataResult.data.hasNext ? (
                  <Link
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    href={pageHref(dataResult.data.page + 1)}
                  >
                    下一页
                  </Link>
                ) : (
                  <span className={disabledClass} aria-disabled="true">
                    下一页
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          选择上方任一表单的「查看数据」，即可查看提交内容、标记状态并导出 .xlsx。
        </p>
      )}
    </div>
  );
}
