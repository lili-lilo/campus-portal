"use client";

import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * 后台导航单项（T3.3 裁决 Q6）—— **唯一的客户端组件**，只包一个链接
 * ============================================================================
 * 为什么单开一个文件（而不是给 `admin-sidebar.tsx` 加 `'use client'`）：
 *   · `AdminNavList` 被桌面侧边栏与移动端抽屉**共用**，整体转客户端会扩大边界；
 *   · 本组件只接收可序列化的 `href` / `label`，`usePathname()` 也只在这里用到。
 *
 * 高亮规则（裁决 Q6）：`pathname === href || pathname.startsWith(href + "/")`
 *   → 加 `aria-current="page"` + 高亮样式（`/admin/articles/new` 也点亮「内容管理」）。
 */
export function AdminNavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-2",
        isActive
          ? "bg-muted font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </a>
  );
}
