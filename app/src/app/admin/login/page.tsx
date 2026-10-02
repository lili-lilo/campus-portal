import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";

export const metadata: Metadata = { title: "后台登录" };

// 后台全部 SSR（docs/15 §9.1）
export const dynamic = "force-dynamic";

/**
 * 登录服务端动作（Auth.js v5 在 App Router 的推荐写法，见 `next-auth/index.d.ts:232-252`）
 *
 * 成功：`signIn()` 内部会抛 `NEXT_REDIRECT`（跳回调地址），因此**必须原样抛出**，
 *       不能被这里的 catch 吞掉（它 `instanceof AuthError` 为 false）。
 * 失败：统一回落到 `?error=invalid_credentials`，页面显示同一句提示
 *       （不区分"用户不存在 / 已停用 / 密码错误"）。
 */
async function loginAction(formData: FormData) {
  "use server";

  // 字段名是 `redirectTo`：Auth.js v5 从 FormData 按此名读取回调地址
  // （next-auth/lib/actions.js: `const callbackUrl = redirectTo?.toString() ?? …`）
  const redirectTo = String(formData.get("redirectTo") ?? "/admin/dashboard");

  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(
        `/admin/login?error=invalid_credentials&callbackUrl=${encodeURIComponent(redirectTo)}`,
      );
    }
    throw error;
  }
}

/**
 * 后台登录页（docs/15 §9.1：数据源 `signIn`(Auth.js)）
 *
 * 保持 **Server Component**（无 `'use client'`）：表单直接提交给 Server Action。
 * 提交中态本步不做；若后续需要，在子组件用 `useFormStatus`，不改本文件的声明。
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  // proxy 用 `callbackUrl` 传原路径（docs/15 §5.2）；这里再以 `redirectTo` 交给 Auth.js
  const redirectTo = callbackUrl ?? "/admin/dashboard";

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">后台登录</h1>
        <p className="text-sm text-muted-foreground">XX大学站群内容管理后台</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          用户名或密码不正确
        </p>
      ) : null}

      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="redirectTo" defaultValue={redirectTo} />

        <div className="space-y-2">
          <label htmlFor="username" className="text-sm font-medium">
            用户名
          </label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            密码
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          登录
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        演示账号见仓库根 README（`admin` / `site_admin` / `editor` / `auditor`，密码均为
        `admin123`）。
      </p>
    </main>
  );
}
