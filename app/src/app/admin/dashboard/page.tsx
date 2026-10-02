import type { Metadata } from "next";

export const metadata: Metadata = { title: "仪表盘" };

// 后台全部 SSR（docs/15 §9.1：数据要实时，且登录后访问、无需 SEO）
export const dynamic = "force-dynamic";

// TODO(T1.6→T1.10)：数据接入见 docs/14 §5 的 getDashboardStats / getVisitTrend；当前为 T1.6 路由骨架占位页。
export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">仪表盘</h1>
      <p className="text-sm text-muted-foreground">
        T1.6 路由骨架占位页（/admin/dashboard）。权限：登录 + menu.dashboard。真实数据见 T1.10。
      </p>
    </div>
  );
}
