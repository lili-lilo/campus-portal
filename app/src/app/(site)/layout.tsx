import type { ReactNode } from "react";

/**
 * 前台公共布局（docs/15 §1 / §6.1：`(site)` 路由组，共享 SiteHeader + SiteFooter）
 *
 * T1.6 阶段是**骨架**：Header/Footer 用占位实现，导航数据（Navigation + Config(group=site)）
 * 留到 T1.10 接 Server Action。`(site)` 是路由组，括号不进 URL，用于与 /admin、/api 隔离。
 */
export default function SiteGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {/* TODO(T1.10)：读 listNavigations() + listConfigs(group=site) 渲染真实导航 */}
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <span className="text-base font-semibold tracking-tight">XX大学站群</span>
          <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>导航占位（T1.10 接入 Navigation）</span>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-muted-foreground">
          <p>版权所有 © XX大学</p>
          <p className="mt-1">XX省XX市XX路 1 号</p>
        </div>
      </footer>
    </div>
  );
}
