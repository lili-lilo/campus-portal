import Link from "next/link";

/**
 * 全局 404（docs/15 §6.1）
 * 位于根段，**在 [locale] 之外**，因此这里不取 next-intl 文案（无 locale 上下文），
 * 统一中文（与后台一致）。
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-5xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">页面不存在</h1>
      <p className="text-sm text-muted-foreground">
        你访问的地址没有对应内容，可能已删除或输入有误。
      </p>
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        返回首页
      </Link>
    </main>
  );
}
