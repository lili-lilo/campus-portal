"use client";

/**
 * 全局错误边界（docs/15 §6.1 / §6.2 U6：**仅全局一个**，不做分段 error.tsx）
 * 必须是 Client Component（Next 约定：error.tsx 接收 error + reset）。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold">出错了</h1>
      <p className="text-sm text-muted-foreground">
        页面渲染时发生异常，请重试；若持续出现请联系管理员。
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">错误编号：{error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        重试
      </button>
    </main>
  );
}
