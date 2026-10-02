import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getSiteContext } from "@/lib/site-context";

/**
 * 站点段布局（docs/15 §1 / §6.1：校验站点存在 + 注入站点上下文 + 公共 Header/Footer）
 *
 * T2.1 起：
 *   · 站点存在性由 **查库**（`getSiteContext` → `Site.status`）判定，替换 T1.6 的硬编码白名单
 *     （`docs/00` §8 #37 的一处；其余两处待第 4 周随 Server Action 一并处理）
 *   · 真实 `SiteHeader` / `SiteFooter` 挂在这一层 —— 只有这层拿得到 `site` 参数
 *     （上一级 `(site)/[locale]/layout.tsx` 没有 `site`，放不了站点级导航）
 *
 * 渲染策略（实测依据：T1.7 的 `[site]/page.tsx` 同样写 `revalidate = 300`，构建产物里该路由为 `ƒ`）：
 *   · `[site]` 段**没有** `generateStaticParams` → 路由**按需动态渲染 + 300s ISR 缓存**
 *   · 因此**构建期不会执行 Prisma 查询**（DSH/CI 的 better-sqlite3 ABI 差异不会影响 `next build`）
 *   · 本轮的 `revalidate` 只表达"发稿后 5 分钟内可见"的缓存意图（A25），与 `docs/15` §6 的分档一致
 */
export const revalidate = 300;

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; site: string }>;
}) {
  const { locale, site: siteSlug } = await params;

  const context = await getSiteContext(siteSlug);

  if (!context) {
    // 站点不存在或 status=false → 命中站点级 not-found.tsx（docs/15 §6.2 U2 的兜底之一）
    notFound();
  }

  return (
    <div data-site={context.site.slug} className="flex min-h-full flex-col bg-background">
      <SiteHeader site={context.site} nav={context.nav} locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter site={context.site} nav={context.nav} locale={locale} />
    </div>
  );
}
