import { z } from "zod";

import { isSlugReservedForAdmin } from "@/lib/slug";

/**
 * 文章表单 zod schema（T3.5 / docs/14 §2.5 L179「与表单共用同一份 schema，避免两处漂移」）
 * ============================================================================
 * · 本文件**不写** `"use server"` / `"use client"` —— 两侧共用同一模块。
 *   （为何不放 `articles/actions.ts`：`"use server"` 文件只允许导出 async 函数，schema 常量导不出。）
 * · 客户端：`useForm({ resolver: zodResolver(articleFormSchema) })`（先例 `(dev)/tokens/form-demo.tsx` L45-L48）
 * · 服务端：`articleFormSchema.safeParse(input)`；失败 → `VALIDATION_FAILED`（docs/14 §2.2 L123）
 * · slug 保留字用 `isSlugReservedForAdmin`（`src/lib/slug.ts` L45-L47，纯函数、可进客户端包）：
 *   这里放一份是给**客户端内联提示**；服务端在 safeParse **之前**还会再判一次并回
 *   `SLUG_RESERVED`（docs/14 §2.2 L128）+ `field:"slug"`（T3.5 裁决 Q4）—— 两处都要。
 * · 空串约定：`summary` / `cover` 允许 `""`（表单未填）；落库时由 Action 转 `null`
 *   （docs/14 §2.1 L111：用 `null` 不用 `undefined`）。
 * · `content` 的校验**先剥标签再判空**：Tiptap 空文档的 `getHTML()` 是 `"<p></p>"`，
 *   纯 `min(1)` 拦不住"没写正文"，故用 strip-tags 后再看长度。
 */

/** slug 允许字符（裁决 Q2）：小写字母 / 数字 / 连字符 */
export const SLUG_PATTERN = /^[a-z0-9-]+$/;

export const articleFormSchema = z.object({
  channelId: z.string("请选择栏目").min(1, "请选择栏目"),
  title: z.string("请填写标题").min(1, "请填写标题").max(200, "标题不超过 200 字"),
  slug: z
    .string("请填写 slug")
    .min(1, "请填写 slug")
    .max(80, "slug 不超过 80 字符")
    .regex(SLUG_PATTERN, "slug 只能包含小写字母、数字与连字符")
    .refine((value) => !isSlugReservedForAdmin(value), "该 slug 是系统保留字"),
  summary: z.string().max(500, "摘要不超过 500 字").optional().or(z.literal("")),
  content: z
    .string("请填写正文")
    .refine((html) => html.replace(/<[^>]*>/g, "").trim().length > 0, "请填写正文"),
  cover: z.url("请输入有效的图片地址").optional().or(z.literal("")),
});

export type ArticleFormValues = z.infer<typeof articleFormSchema>;
