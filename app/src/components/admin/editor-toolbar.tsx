"use client";

import { useEditorState, type Editor } from "@tiptap/react";

import { Button } from "@/components/ui/button";

/**
 * 编辑器工具栏（T3.4 裁决 Q4）—— `'use client'`
 * ============================================================================
 * · active 态**必须**走 `useEditorState({ editor, selector })`：v3 的
 *   `shouldRerenderOnTransaction` 默认 `false`（`@tiptap/react` d.ts **L19-L23**，注明 legacy、
 *   "will be removed in future versions"）⇒ 直接读 `editor.isActive(...)` 不会随输入刷新按钮高亮。
 * · `editor: Editor | null` 时命中 d.ts **L612** 的重载 → 返回 `T | null`；
 *   hooks 必须先无条件调用，**早退放在 hook 之后**（`editor` 为 null 时整个工具栏不渲染）。
 * · 按钮复用 `ui/button` 的 `variant="ghost" size="sm"`（**只 import，不改 `ui/`**）。
 * · 9 个按钮：H2 / H3 / 粗体 / 斜体 / 无序列表 / 有序列表 / 引用 / 撤销 / 重做。
 *   撤销/重做来自 v3 内建的 `UndoRedo`（`@tiptap/starter-kit` index.js **L38**；
 *   v2 的 `history` 已改名 `undoRedo`，d.ts **L68-L72**）—— 无需额外引包。
 */

type ToolbarState = {
  h2: boolean;
  h3: boolean;
  bold: boolean;
  italic: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
};

const EMPTY_STATE: ToolbarState = {
  h2: false,
  h3: false,
  bold: false,
  italic: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
};

type ToolbarItem = {
  key: string;
  label: string;
  active?: boolean;
  run: () => void;
};

const SEPARATOR_CLASS = "mx-1 h-4 w-px bg-border";

export function EditorToolbar({ editor }: { editor: Editor | null }) {
  const state = useEditorState({
    editor,
    // 刻意**忽略 `snapshot` 参数**，改读闭包里的 `editor`（当前 render 的实例）：
    // `EditorStateManager.watch()` 只做 `this.editor = nextEditor` + 挂监听，**不通知订阅者、
    // 也不重建 `lastSnapshot`**（`@tiptap/react` index.js L227-L250 vs `getSnapshot()` L197-L205）
    // ⇒ 编辑器就绪后、首次 transaction 之前，`snapshot.editor` 仍是 null、选择器恒为 false。
    // 读闭包可消除这个陈旧窗口（一次点击/输入即自愈，但不该让首帧白等一次事务）。
    selector: () => ({
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      blockquote: editor?.isActive("blockquote") ?? false,
    }),
  });

  // SSR 首帧 / 编辑器未就绪：`immediatelyRender: false`（T3.4 Q3）下 editor 为 null
  if (!editor) {
    return null;
  }

  const active = state ?? EMPTY_STATE;

  const groups: Array<{ name: string; items: ToolbarItem[] }> = [
    {
      name: "heading",
      items: [
        {
          key: "h2",
          label: "H2",
          active: active.h2,
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          key: "h3",
          label: "H3",
          active: active.h3,
          run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        },
      ],
    },
    {
      name: "inline",
      items: [
        {
          key: "bold",
          label: "粗体",
          active: active.bold,
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          key: "italic",
          label: "斜体",
          active: active.italic,
          run: () => editor.chain().focus().toggleItalic().run(),
        },
      ],
    },
    {
      name: "list",
      items: [
        {
          key: "bulletList",
          label: "无序列表",
          active: active.bulletList,
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          key: "orderedList",
          label: "有序列表",
          active: active.orderedList,
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          key: "blockquote",
          label: "引用",
          active: active.blockquote,
          run: () => editor.chain().focus().toggleBlockquote().run(),
        },
      ],
    },
    {
      name: "history",
      items: [
        { key: "undo", label: "撤销", run: () => editor.chain().focus().undo().run() },
        { key: "redo", label: "重做", run: () => editor.chain().focus().redo().run() },
      ],
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-2 py-1.5">
      {groups.map((group, groupIndex) => (
        <div key={group.name} className="flex items-center gap-1">
          {groupIndex > 0 ? <span aria-hidden className={SEPARATOR_CLASS} /> : null}

          {group.items.map((item) => (
            <Button
              key={item.key}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={item.active}
              // active 必须与 ghost variant 的 hover（`hover:bg-muted`，ui/button.tsx L16-L17）
              // **视觉可区分**：`--muted` #f5f7fa 压在 `--card` #ffffff 上几乎不可见
              // （globals.css L134/L142）⇒ 改用 `--primary` #1a4f8b（L138，8.28:1）。
              // 只"使用"语义变量，不覆盖任何被禁覆盖的 token。
              className={item.active ? "bg-primary/10 text-primary hover:bg-primary/15" : undefined}
              onClick={item.run}
            >
              {item.label}
            </Button>
          ))}
        </div>
      ))}
    </div>
  );
}
