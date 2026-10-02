import type { Metadata } from "next";

export const metadata: Metadata = { title: "现任领导" };

// ISR：docs/15 §6 规定 revalidate = 3600（0 表示 SSR）
export const revalidate = 3600;

// TODO(T1.6→T1.10)：数据接入见 docs/14 §5 的 getPage；当前为 T1.6 路由骨架占位页。
export default function AboutLeadersPage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">现任领导</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/main/about/leaders）。真实数据与渲染见 T1.10。
      </p>
    </section>
  );
}
