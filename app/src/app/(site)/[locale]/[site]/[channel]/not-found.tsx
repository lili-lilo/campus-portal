import Link from "next/link";

/**
 * 栏目级 404（docs/15 §6.2 U2 的兜底 + U-C 裁决）
 *
 * 触发场景：
 *   · 栏目不存在（CHANNEL_TYPES 里查不到）
 *   · `Channel.type='form'` —— docs/14 §8 A2 裁决本期不渲染前台表单 → 调 notFound()
 * 因此文案同时覆盖"不存在"与"暂未开放"两种情况。
 */
export default function ChannelNotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">该栏目不存在或暂未开放</h1>
      <p className="text-sm text-muted-foreground">
        你访问的栏目没有对应内容。其中「表单型」栏目本期暂不提供前台渲染。
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
