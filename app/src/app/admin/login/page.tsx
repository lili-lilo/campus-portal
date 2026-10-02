import type { Metadata } from "next";

export const metadata: Metadata = { title: "后台登录" };

// 后台全部 SSR（docs/15 §9.1）
export const dynamic = "force-dynamic";

/**
 * 后台登录页（docs/15 §9.1：`/admin/login`，数据源 `signIn`(Auth.js)）
 *
 * T1.6 为骨架：表单结构就位，但**未接 Server Action**（`signIn` 的接法见 T1.8，
 * 与 docs/14 §2.4 的三层鉴权一起做）。当前提交不会真正登录。
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-6 px-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">后台登录</h1>
        <p className="text-sm text-muted-foreground">XX大学站群内容管理后台</p>
      </div>

      {/* TODO(T1.8)：改为 Server Action + signIn("credentials")，并保留 callbackUrl */}
      <form className="space-y-4">
        <input type="hidden" name="callbackUrl" defaultValue={callbackUrl ?? "/admin/dashboard"} />

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
        T1.6 路由骨架占位：登录动作待 T1.8 接入 Auth.js Credentials。
      </p>
    </main>
  );
}
