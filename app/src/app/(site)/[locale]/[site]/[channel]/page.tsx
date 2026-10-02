import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = { title: "栏目" };

// ISR：docs/15 §6 规定通用栏目页 revalidate = 300
export const revalidate = 300;

/**
 * 通用栏目页 —— `[channel]` 四分支（docs/15 §4.3 / A20）
 *
 * T1.6 临时实现：栏目类型表硬编码（与 T1.5 seed 的栏目一致），
 * 目的：① 四分支逻辑现在就能跑；② 构建期不加载 Prisma（ABI 限制）。
 * TODO(T1.10)：改为 getChannelTree() 读 Channel 表（name/type/url/status）。
 *
 * 注意：主站 8 个顶级栏目的 slug 全部是**保留 slug**（about/news/notice/departments/
 * faculty/admissions/research/disclosure），由静态路由接管 —— A19 修订（docs/11 v1.4）
 * 明确 [channel] 不会遇到它们；因此本表只登记子站的 `programs` / `contact`。
 */
type ChannelType = "list" | "page" | "link" | "form";

const CHANNEL_TYPES: Record<string, Record<string, { type: ChannelType; url?: string }>> = {
  cs: { programs: { type: "list" }, contact: { type: "page" } },
  ee: { programs: { type: "list" }, contact: { type: "page" } },
  ba: { programs: { type: "list" }, contact: { type: "page" } },
};

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ locale: string; site: string; channel: string }>;
}) {
  const { site, channel } = await params;
  const def = CHANNEL_TYPES[site]?.[channel];

  // 栏目不存在 → 最近的 not-found.tsx（[channel]/not-found.tsx）
  if (!def) {
    notFound();
  }

  if (def.type === "form") {
    // docs/14 §8 A2：type='form' 的栏目本期不渲染（不做前台表单渲染）→ 404 + 提示
    notFound();
  }

  if (def.type === "link") {
    // type='link' → 服务端 302 跳转到 Channel.url；url 为空时 404（docs/15 §4.3 / U1）
    if (!def.url) {
      notFound();
    }
    redirect(def.url);
  }

  if (def.type === "page") {
    // type='page' → 取 Page 渲染单页；该栏目无 Page 记录时 404
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
        <p className="text-sm text-muted-foreground">栏目页 · 分支 page</p>
        <h1 className="text-2xl font-semibold tracking-tight">单页内容占位</h1>
        <p className="text-sm text-muted-foreground">
          T1.6 路由骨架占位页（/{site}/{channel}）。getPage 接入见 T1.10。
        </p>
      </main>
    );
  }

  // type='list' → 该栏目下的文章列表（分页、按 publishTime 倒序）；无文章时显示空态，不 404
  return (
    <main className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10">
      <p className="text-sm text-muted-foreground">栏目页 · 分支 list</p>
      <h1 className="text-2xl font-semibold tracking-tight">栏目文章列表占位</h1>
      <p className="text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/{site}/{channel}）。listArticles 接入见 T1.10。
      </p>
      <p className="text-sm text-muted-foreground">
        文章详情走 /{site}/{channel}/[id]（本骨架中为占位链接目标）。
      </p>
    </main>
  );
}
