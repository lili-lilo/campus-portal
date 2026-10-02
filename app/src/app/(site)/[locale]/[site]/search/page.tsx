import type { Metadata } from "next";

export const metadata: Metadata = { title: "站内搜索" };

// SSR：docs/15 §6 规定搜索页不做 ISR（revalidate: 0）
export const revalidate = 0;

// TODO(T1.6→T1.10)：数据接入见 docs/14 §5 的 GET /api/search?site=&q=；当前为 T1.6 路由骨架占位页。
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">站内搜索</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/main/search）。真实数据与渲染见 T1.10。
      </p>
      <p className="mt-2 text-sm">当前查询词：{q ?? "（空）"}</p>
    </section>
  );
}
