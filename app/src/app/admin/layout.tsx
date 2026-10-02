import type { ReactNode } from "react";
import { cookies } from "next/headers";

/**
 * 后台布局（docs/15 §6.1 / §9.1）
 *
 * 会话判定（U-I 裁决的同一条原则）：**只检查 Auth.js 的会话 cookie 是否存在**，
 * 不 import `@/lib/auth`（避免把 PrismaAdapter/Prisma 拖进构建与后台 bundle）。
 * 未登录时**不在此处重定向** —— 重定向由 `src/proxy.ts` 负责；本布局若重定向，
 * 会把 `/admin/login` 自己套进死循环。
 *
 * TODO(T1.8)：接 `auth()` 做完整会话校验；TODO(T1.10)：侧边栏按 14 个 `menu.*` 权限码过滤。
 */
export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

type MenuItem = { href: string; label: string; code: string };

const MENU: readonly MenuItem[] = [
  { href: "/admin/dashboard", label: "仪表盘", code: "menu.dashboard" },
  { href: "/admin/articles", label: "内容管理", code: "menu.articles" },
  { href: "/admin/channels", label: "栏目管理", code: "menu.channels" },
  { href: "/admin/media", label: "媒体库", code: "menu.media" },
  { href: "/admin/users", label: "用户管理", code: "menu.users" },
  { href: "/admin/roles", label: "角色权限", code: "menu.roles" },
  { href: "/admin/sites", label: "站点管理", code: "menu.sites" },
  { href: "/admin/audits", label: "审核待办", code: "menu.audits" },
  { href: "/admin/forms", label: "表单管理", code: "menu.forms" },
  { href: "/admin/comments", label: "评论管理", code: "menu.comments" },
  { href: "/admin/messages", label: "留言管理", code: "menu.messages" },
  { href: "/admin/statistics", label: "统计分析", code: "menu.statistics" },
  { href: "/admin/settings", label: "系统设置", code: "menu.settings" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const hasSession = SESSION_COOKIE_NAMES.some((name) => Boolean(jar.get(name)?.value));

  // 未登录：只渲染 children（让 /admin/login 自己占满屏），重定向交给 proxy
  if (!hasSession) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="text-sm font-semibold">XX大学站群 · 后台</span>
        {/* TODO(T1.8)：显示当前用户 + 退出登录 */}
        <span className="text-xs text-muted-foreground">已登录（会话校验待 T1.8 接入）</span>
      </header>

      <div className="flex flex-1">
        <aside className="w-56 shrink-0 border-r border-border/60 p-3">
          <nav className="flex flex-col gap-1 text-sm">
            {MENU.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
