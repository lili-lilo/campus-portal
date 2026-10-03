"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { EditorToolbar } from "@/components/admin/editor-toolbar";

/**
 * 富文本编辑器（T3.4 / docs/16 §4.2 M3 L298）—— `'use client'`
 * ============================================================================
 * v3 关键写法（均取自已装包 `d.ts` / `index.js`，见 T3.4 探路报告）：
 *   · `immediatelyRender: false`（`@tiptap/react` d.ts **L17** + 重载 **L32-L34**）：Next 下运行时
 *     默认即为 false（react index.js **L305-L315**），显式写是为消掉 dev 警告并命中
 *     `Editor | null` 重载 ⇒ 组件内必须处理 `editor === null`（工具栏已按此早退）。
 *   · `extensions: [StarterKit]`：**不单独 import Link** —— v3 StarterKit 已内建 Link
 *     （starter-kit d.ts **L93-L97**、index.js **L46-L49**）；重复注册会触发 core 的
 *     duplicate 警告（`@tiptap/core` index.js **L1633**）。撤销/重做同样内建（`UndoRedo`，
 *     index.js **L38**；v3 已把 v2 的 `history` 改名 `undoRedo`，d.ts **L68-L72**）。
 *   · 本轮**不加** `@tiptap/extension-image`（T3.4 裁决 Q5）；`Link` 行为走
 *     `StarterKit.configure({ link })` 定制：`LinkOptions.openOnClick` 默认 `true`
 *     （extension-link d.ts **L41-L46**），编辑时点自己的链接会跳走 → 显式关掉。
 *
 * 非受控（T3.4 裁决 Q6）：`initialContent` **只经 `content` 注入一次**；挂载后再改该 prop
 * 不会同步进编辑器（要同步得 `editor.commands.setContent(...)`，会引发光标跳动，本期不做）。
 * 取值：`onUpdate` 里 `editor.getHTML()` 交给 `onChange`（T3.5 接 RHF 字段）。
 *
 * ⚠ 服务端使用注意：`onChange` 是函数，**Server Component 不能传**（RSC 不可序列化）；
 *    本组件只应在客户端表单容器里使用（T3.5）。
 *
 * 样式：全部走组件内 Tailwind 任意变体（`globals.css` 属 T1.3 冻结区，禁改）。下面这几条是
 * 必需的 —— 依据 `docs/00` §8 #54（L584）的长期规则：Preflight 重置了 `ul`/`ol` 列表符号与
 * 标题字号字重，用到就必须**自行显式声明**。
 */
const EDITOR_STYLES = [
  "[&_.ProseMirror]:min-h-[300px]",
  "[&_.ProseMirror]:outline-none",
  "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6",
  "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6",
  "[&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:my-3",
  "[&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:my-3",
  "[&_.ProseMirror_h3]:text-lg [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:my-2",
  "[&_.ProseMirror_p]:my-2",
  "[&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground",
].join(" ");

export function RichTextEditor({
  initialContent = "",
  onChange,
}: {
  initialContent?: string;
  onChange?: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: initialContent,
    onUpdate: ({ editor: current }) => {
      onChange?.(current.getHTML());
    },
  });

  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10">
      <EditorToolbar editor={editor} />

      <div className={`px-3 py-2 ${EDITOR_STYLES}`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
