import type { ReactNode } from "react";
import { notFound } from "next/navigation";

/**
 * 站点段布局（docs/15 §1 / §6.1：校验站点存在 + 注入站点上下文）
 *
 * T1.6 临时实现：站点 slug 白名单硬编码（与 T1.5 seed 的 4 个站点一致），
 * 目的是让"站点不存在 → 站点级 404"这条规格现在就能生效，且**构建期不加载 Prisma**
 *（DSH 侧 node 与 better-sqlite3 的 ABI 不匹配，构建期触碰 Prisma 会 ERR_DLOPEN_FAILED）。
 * TODO(T1.10)：改为查询 Site 表（listSites / getSiteBySlug）并做 status 校验。
 */
const SITE_SLUGS = ["main", "cs", "ee", "ba"] as const;

export default async function SiteLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; site: string }>;
}) {
  const { site } = await params;

  if (!(SITE_SLUGS as readonly string[]).includes(site)) {
    // 命中站点级 not-found.tsx（docs/15 §6.2 U2 的兜底之一）
    notFound();
  }

  // 站点上下文：子页面自行 await params 读取 site；此处只做存在性校验与语义容器
  return (
    <div data-site={site} className="flex min-h-full flex-col">
      {children}
    </div>
  );
}
