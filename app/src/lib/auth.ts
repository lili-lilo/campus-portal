// ============================================================================
// Auth.js v5 配置 —— 演示账号（T1.8）
//
// 职责边界（docs/14 §2.4）：
//   · 本文件实现 **L1 认证**（是否登录、会话是否有效），并负责把 L2/L3 需要的
//     字段放进 session；**L2（权限码）/ L3（数据范围）** 由第 4 周的
//     `requirePermission` 实现，不在本文件。
//
// 关键写法确认（均来自已安装包的类型定义，非记忆）：
//   - `authorize(credentials, request) => Awaitable<User | null>`  ← @auth/core/providers/credentials.d.ts:53
//   - `AuthError` / `CredentialsSignin` 从 `"next-auth"` 导出       ← next-auth/index.d.ts:76
//   - 服务端 `signIn(provider, formData)` 直接吃 `FormData`          ← next-auth/index.d.ts:255
//   - 该 `FormData` 里按 **`redirectTo`** 读回调地址（不是 callbackUrl）
//                                                                  ← next-auth/lib/actions.js
// ============================================================================

import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

/**
 * 统一的登录失败错误。
 *
 * 用户不存在 / 账号已停用 / 密码错误**一律抛这一个**，凭据中不含任何区分信息，
 * 避免账号枚举；Auth.js 只把它转成通用失败（页面侧统一提示）。
 */
class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

/** authorize 成功时交给 jwt/session callback 的用户形状 */
type AuthorizedUser = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  siteId: string | null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // Credentials 流程**必须**用 jwt 会话（database 会话不被支持）
  session: { strategy: "jwt" },

  secret: process.env.AUTH_SECRET,
  trustHost: true,

  // 登录页固定为后台自己的页面（docs/15 §9.1），不回落到 /api/auth/signin
  pages: { signIn: "/admin/login" },

  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },

      /**
       * 完整登录逻辑（顺序固定，失败路径全部收敛到同一条）：
       *   1. 取 username（trim）/ password；任一为空 → 失败
       *   2. 按 username 查库（`username` 是 `@unique`）
       *   3. 用户不存在 → 失败（不进入 bcrypt）
       *   4. `user.status === false` → 失败（与密码错误不可区分）
       *   5. `bcrypt.compare` 不匹配 → 失败
       *   6. 成功 → 返回 L1 结果 + L2/L3 需要的 role/siteId
       * 说明：不做等时延处理 —— 登录场景下用户名对使用者不是秘密（用户裁决）。
       */
      async authorize(credentials) {
        const username =
          typeof credentials?.username === "string" ? credentials.username.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!username || !password) {
          throw new InvalidCredentialsError();
        }

        const user = await prisma.user.findUnique({
          where: { username },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            siteId: true,
            status: true,
          },
        });

        if (!user || !user.status) {
          throw new InvalidCredentialsError();
        }

        const passwordMatches = await bcrypt.compare(password, user.password);
        if (!passwordMatches) {
          throw new InvalidCredentialsError();
        }

        const authorized: AuthorizedUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          siteId: user.siteId,
        };

        return authorized;
      },
    }),
  ],

  callbacks: {
    /** 登录时把 id/role/siteId 写进 JWT；后续请求直接沿用（不再查库） */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.siteId = user.siteId;
      }
      return token;
    },

    /** 把上述字段暴露给 `auth()` 的调用方（Server Action / Server Component） */
    session({ session, token }) {
      // JWT 字段按运行时类型收窄（**不使用 `as` 强转**）：
      // `JWT` 的接口声明在 `@auth/core/jwt`（`JWT extends Record<string, unknown>, DefaultJWT`），
      // 而 `next-auth/jwt` 只是转发入口、且 `@auth/core` 在本项目的 pnpm 隔离布局下
      // 不是可解析依赖 → 无法用模块增强给它加字段（详见 src/types/next-auth.d.ts 顶部说明）。
      session.user.id = typeof token.id === "string" ? token.id : (token.sub ?? "");
      session.user.role = typeof token.role === "string" ? token.role : "";
      session.user.siteId = typeof token.siteId === "string" ? token.siteId : null;
      return session;
    },
  },
});
