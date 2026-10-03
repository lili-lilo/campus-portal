import type { Metadata } from "next";

import { RichTextEditor } from "@/components/admin/rich-text-editor";

export const metadata: Metadata = { title: "新建文章" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

/**
 * 新建文章（T3.4：**只挂载富文本编辑器**）
 *
 * 本页**不做**表单、不做提交、不建 Server Action —— 均属 T3.5（docs/16 §4.2 M3 L297）。
 * 编辑器非受控：`initialContent` 只注入一次；`onChange` 只应在客户端表单容器里接
 * （Server Component 不能传函数）。
 */
export default function NewArticlePage() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">新建文章</h1>
        <p className="text-sm text-muted-foreground">
          富文本编辑器（Tiptap v3）可编辑区（T3.5 将接入表单与提交流程）。
        </p>
      </div>

      <RichTextEditor initialContent="<p>在这里输入正文…</p>" />
    </div>
  );
}
