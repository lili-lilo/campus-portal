"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { createArticle, updateArticle, type ChannelOption } from "@/app/admin/articles/actions";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { articleFormSchema, type ArticleFormValues } from "@/lib/validation/article";

/**
 * 文章表单（T3.5）—— **本轮唯一的新客户端组件**
 * ============================================================================
 * · 6 个字段（裁决 Q1）：channelId / title / slug / summary / content / cover
 *   （author / source / tags / mediaIds 不做）
 * · 校验：`zodResolver(articleFormSchema)`（共用 `@/lib/validation/article`，docs/14 §2.5 L179）；
 *   服务端校验是权威（Action 内再 `safeParse`）——客户端只负责"字段级提示"（R5 / docs/16 L299）
 * · `content` 走 T3.4 的非受控编辑器：`onChange -> field.onChange`（单向 编辑器 → RHF），
 *   `initialContent` 只在挂载时注入一次（编辑器**不能**用 `FormControl` 包 —— 它会给子元素塞 id/aria）
 * · 失败展示（裁决 Q7）：`Fail.field === "slug"` → `form.setError("slug")`；
 *   其余 → 表单顶部 `<p role="alert">`（与 `dashboard/page.tsx` 的 `DashboardNotice` 同款样式）
 * · 成功：`router.push("/admin/articles")`（不挂 `<Toaster/>`，本轮不改根布局）
 * · 栏目下拉用**原生 `<select>`**（沿用 T3.3 `article-filter.tsx` 口径，不引 Radix Select）
 */

const EMPTY_VALUES: ArticleFormValues = {
  channelId: "",
  title: "",
  slug: "",
  summary: "",
  content: "",
  cover: "",
};

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

/** slug 留空时的自动派生（裁决 Q2）：`article-{yyyyMMddHHmmss}`，**本地时区** */
function deriveSlug(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `article-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export function ArticleForm({
  mode,
  initialData,
  channelTree,
}: {
  mode: "create" | "edit";
  /** 编辑模式必传：表单初值 + 文章 id */
  initialData?: ArticleFormValues & { id: string };
  channelTree: readonly ChannelOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const defaultValues: ArticleFormValues = initialData
    ? {
        channelId: initialData.channelId,
        title: initialData.title,
        slug: initialData.slug,
        summary: initialData.summary ?? "",
        content: initialData.content,
        cover: initialData.cover ?? "",
      }
    : EMPTY_VALUES;

  const form = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues,
  });

  /** 栏目跨站点时才在选项后附站点名（super_admin 的 `siteId` 为 null → 会拿到 4 个站点的栏目） */
  const showSiteName = new Set(channelTree.map((option) => option.siteName)).size > 1;

  async function onSubmit(values: ArticleFormValues) {
    setServerError(null);
    setSubmitting(true);

    try {
      const result =
        mode === "create"
          ? await createArticle(values)
          : await updateArticle({ id: initialData?.id ?? "", ...values });

      if (!result.ok) {
        // `Fail.field` 只用于服务端独有校验（docs/14 §2.1 L89；T3.5 裁决 Q4）
        if (result.field === "slug") {
          form.setError("slug", { message: result.message });
          return;
        }
        setServerError(result.message);
        return;
      }

      router.push("/admin/articles");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
        {serverError ? (
          <p role="alert" className={ALERT_CLASS}>
            {serverError}
          </p>
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="channelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>栏目</FormLabel>
                <FormControl>
                  <select {...field} className={SELECT_CLASS}>
                    <option value="">请选择栏目</option>
                    {channelTree.map((option) => (
                      <option key={option.id} value={option.id}>
                        {"　".repeat(option.depth)}
                        {option.name}
                        {showSiteName ? `（${option.siteName}）` : ""}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>标题</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="请输入标题" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>slug</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="article-20261003163700"
                  onBlur={() => {
                    field.onBlur();
                    if (field.value.trim() === "") {
                      form.setValue("slug", deriveSlug(new Date()), { shouldValidate: true });
                    }
                  }}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                留空则在失焦时自动生成 <code>article-时间戳</code>；只能用小写字母、数字与连字符。
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="summary"
          render={({ field }) => (
            <FormItem>
              <FormLabel>摘要（可选）</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} placeholder="列表页与搜索结果中显示的一段话" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>正文</FormLabel>
              {/* 非受控编辑器（T3.4 裁决 Q6）：初值只经 `initialContent` 注入一次，
                  之后由 `onChange` 把 HTML 单向同步进 RHF；此处不能用 `FormControl` */}
              <RichTextEditor
                initialContent={initialData?.content ?? ""}
                onChange={field.onChange}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="cover"
          render={({ field }) => (
            <FormItem>
              <FormLabel>封面图 URL（可选）</FormLabel>
              <FormControl>
                <Input {...field} type="url" placeholder="https://example.com/cover.jpg" />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                媒体选择器属 M4（T3.6），本轮先手填图片地址。
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? "保存中…" : "保存草稿"}
          </Button>

          <Link
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href="/admin/articles"
          >
            取消
          </Link>
        </div>
      </form>
    </Form>
  );
}
