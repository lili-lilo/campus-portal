import type { DefaultSession } from "next-auth";

/**
 * Auth.js v5 类型增强（T1.8）
 *
 * 目的：让 `auth()` 的调用方**无需 `as` 强转**即可拿到三个字段 ——
 *   · `session.user.id`     —— L3 数据范围（`editor` 需 `createdById === session.user.id`，约束 C4）
 *   · `session.user.role`   —— L2 权限判定（`super_admin` 短路，docs/14 §2.4）
 *   · `session.user.siteId` —— L3 站点范围（`super_admin` 为 `null` 表示全站）
 *
 * `User` 的增强是为了让 `authorize()` 直接返回 `role` / `siteId`（否则对象字面量触发多余属性检查）。
 *
 * ── ⚠ 为什么这里**没有** `JWT` 的增强（T1.8 实测结论）────────────────────────
 * `JWT` 的接口真身声明在 `@auth/core/jwt.d.ts`：
 *     `export interface JWT extends Record<string, unknown>, DefaultJWT { … }`
 * 而 `next-auth/jwt.d.ts` 只有一行 `export * from "@auth/core/jwt";`（纯转发），
 * 且 **`@auth/core` 不是本项目的可解析依赖**（pnpm 隔离布局：`app/node_modules/@auth/core` 不存在，
 * 它只在 `.pnpm/@auth+core@0.41.3/` 里）。因此 `declare module "next-auth/jwt" { interface JWT {…} }`
 * 无法合并到那个接口 —— 实测表现为 `token.id/role/siteId` 仍是索引签名类型，typecheck 报 TS2322。
 *
 * 处置（零 `as` 强转）：在 `src/lib/auth.ts` 的 `session` callback 里对 token 字段做 `typeof` 收窄。
 * 若将来把 `@auth/core` 提升为**直接依赖**（需要装包，T1.8 硬约束 1 不允许），可恢复为模块增强：
 *
 *     // declare module "next-auth/jwt" {
 *     //   interface JWT {
 *     //     id: string;
 *     //     role: string;
 *     //     siteId: string | null;
 *     //   }
 *     // }
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      siteId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    siteId: string | null;
  }
}
