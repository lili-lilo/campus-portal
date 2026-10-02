import type { Metadata } from "next";

export const metadata: Metadata = { title: "编辑文章" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

// TODO(T1.6→T1.10)：数据接入见 docs/14 §5 的 getArticle / listVersions / listAuditRecords；当前为 T1.6 路由骨架占位页。
export default function EditArticlePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">编辑文章</h1>
      <p className="text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/admin/articles/[id]/edit）。权限：article.update + L3（C4：editor
        仅本人）。真实数据见 T1.10。
      </p>
    </div>
  );
}
