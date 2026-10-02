// ============================================================================
// Auth.js v5 配置 —— R1 冒烟用最小版
//
// 本文件验证：Next 16 + Prisma 7 + Auth.js v5 三者能否共存（docs/12 §5 R1）。
// 完整实现（bcrypt 校验、三层鉴权、数据范围）见 docs/14 §2.4，由第 3 周实现。
//
// 关键写法确认（均来自已安装包的类型定义，非记忆）：
//   - NextAuth() 返回 { handlers, auth, signIn, signOut }   ← next-auth/index.d.ts
//   - Credentials 从 "next-auth/providers/credentials" 导入（v5 内置）
//   - authorize 接收**单个对象** { credentials, request }    ← @auth/core/providers/credentials.d.ts
// ============================================================================

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

/** R1 冒烟用的硬编码测试账号（T1.5 起改为 bcrypt + 数据库校验） */
const SMOKE_USER = {
  username: "smoke",
  password: "smoke123",
  name: "冒烟测试用户",
  role: "super_admin",
} as const;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // Credentials 流程**必须**用 jwt 会话（database 会话不被支持）
  session: { strategy: "jwt" },

  secret: process.env.AUTH_SECRET,
  trustHost: true,

  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },

      async authorize(credentials) {
        const username = String(credentials?.username ?? "");
        const password = String(credentials?.password ?? "");

        // R1 只验证"能否走通链路"，不做数据库查询
        if (username !== SMOKE_USER.username || password !== SMOKE_USER.password) {
          return null;
        }

        return {
          id: "smoke-user",
          name: SMOKE_USER.name,
          email: "smoke@example.com",
          role: SMOKE_USER.role,
        };
      },
    }),
  ],

  callbacks: {
    /** 把 role 写入 JWT（后续 RBAC 的 L2 权限判定依赖它，见 docs/14 §2.4） */
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    /** 把 role 暴露给 session */
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
});
