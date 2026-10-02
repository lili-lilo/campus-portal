import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";

/**
 * 根级拦截层 —— Next 16 的 proxy 文件约定（A39 / docs/12 R7）
 *   · 位置：`src/proxy.ts`，与 `app/` 同级（**不是** `src/app/proxy.ts`）
 *     官方：proxy.md:23「in the project root, or inside `src`」；src-folder.md:33
 *   · 导出：单个函数（具名 `proxy` 或 default）—— proxy.md:58
 *   · matcher：必须由本文件**另行**导出 `config`；next-intl 的中间件**不挂** `.config`
 *   · runtime：Next 16 起 proxy 默认 **Node.js runtime**，且 `export const runtime` 会抛错
 *     （proxy.md:255）—— 因此 docs/15 §5.3 里"Edge Runtime 所以不能用 Prisma"的说法已过期
 *
 * 职责只有两件（docs/15 §5.2 / §5.3，U-I 裁决）：
 *   ① locale 协商与重写（默认 zh 不带前缀，URL 形态保持 /main/news）
 *   ② `/admin/*` 的**会话 cookie 存在性**检查 → 未登录 302 到 /admin/login
 * 明确不做：不查数据库、不判权限、**不 import @/lib/auth**
 *（避免把 PrismaAdapter/Prisma 拖进拦截层；真正的安全边界在 Server Action / Server Component）
 */

const handleI18nRouting = createMiddleware(routing);

/** Auth.js v5 的会话 cookie 名（生产 HTTPS 下带 __Secure- 前缀） */
const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(request.cookies.get(name)?.value));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── ② 后台保护（不查数据库，只看 cookie 有无）────────────────────────────
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    // /admin/login 必须放行，否则未登录无法进入登录页（docs/15 §5.4）
    if (pathname === "/admin/login") {
      return NextResponse.next();
    }
    if (!hasSessionCookie(request)) {
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── ① 前台 locale 协商与重写（默认 zh 不带前缀）─────────────────────────
  return handleI18nRouting(request);
}

export const config = {
  matcher: [
    /*
     * 排除（docs/15 §5.4）：
     *   · api        → Route Handler 自行鉴权；/api/auth/* 参与会死循环
     *   · _next       → 构建产物与图片优化
     *   · _vercel     → 平台内部
     *   · 含 "." 的路径 → favicon.ico / robots.txt / sitemap.xml 等静态资源
     */
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
