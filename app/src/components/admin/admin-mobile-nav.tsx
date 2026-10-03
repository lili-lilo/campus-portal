import { AdminNavList, type AdminMenuItem } from "@/components/admin/admin-sidebar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * 移动端后台导航（`<md`）—— T3.1 裁决 4
 * ============================================================================
 * · 用既有 `ui/sheet.tsx`（**只 import，不 edit**）；`sheet.tsx` 自带 `'use client'`，
 *   本文件仍保持 **Server Component**：只把可序列化的 JSX/标题传给客户端组件即可
 * · 桌面侧边栏在 `<md` 被 `AdminSidebar` 的 `hidden md:block` 隐藏，
 *   小屏由本抽屉提供同一份（已按权限过滤的）菜单
 */
export function AdminMobileNav({ items }: { items: readonly AdminMenuItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border/60 px-4 py-2 md:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            菜单
          </Button>
        </SheetTrigger>

        <SheetContent side="left" className="w-64">
          <SheetHeader>
            <SheetTitle>后台导航</SheetTitle>
            <SheetDescription className="sr-only">按当前角色权限过滤后的后台菜单</SheetDescription>
          </SheetHeader>

          <div className="px-3 pb-4">
            <AdminNavList items={items} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
