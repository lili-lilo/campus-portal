import type { ReactNode } from "react";

/**
 * 前台公共布局（`(site)` 路由组，docs/15 §1）
 *
 * `(site)` 是路由组（括号不进 URL），让前台共享一套布局并与 `/admin`、`/api` 隔离。
 *
 * T2.1 起真正的 `SiteHeader` / `SiteFooter` 挂在**下一层**
 * `(site)/[locale]/[site]/layout.tsx` —— 只有那层拿得到 `site` 参数（站点级导航需要它）。
 * 本层只保留 T1.6 的**唯一职责**：提供一个撑满高度的 flex 容器作为 `(site)` 的语义锚点。
 *
 * ⚠ T1.6 的**占位** Header/Footer（含"XX大学站群"与占位版权）已于 T2.1 删除，
 *   否则会与真实组件形成双层页头/页脚（见 docs/00 §8 #48）。
 */
export default function SiteGroupLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-full flex-col">{children}</div>;
}
