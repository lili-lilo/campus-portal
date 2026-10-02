import type { Metadata } from "next";

export const metadata: Metadata = { title: "通知公告" };

// ISR：docs/15 §6 规定 revalidate = 300（0 表示 SSR）
export const revalidate = 300;

// TODO(T1.6→T1.10)：数据接入见 docs/14 §5 的 listArticles({channel:'notice'})；当前为 T1.6 路由骨架占位页。
export default function NoticePage() {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">通知公告</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/main/notice）。真实数据与渲染见 T1.10。
      </p>
    </section>
  );
}
