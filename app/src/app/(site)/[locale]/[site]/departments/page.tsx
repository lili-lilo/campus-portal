import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SiteCards } from "@/components/home/site-cards";
import { listPublicSites } from "@/lib/sites";

// ISR：docs/15 §6（静态型页面）revalidate = 3600
export const revalidate = 3600;

type PageParams = { locale: string; site: string };

/**
 * 院系设置总览（T2.6）—— **不是单页**，而是 `Site` 表的站点清单
 * ============================================================================
 * · 数据：除 `main` 外的全部在营站点（seed 实测 3 个：cs / ee / ba）
 * · 渲染：复用 T2.2 的 `SiteCards`（移动 2 列 / 桌面 4 列卡片，链接指向 `/[slug]`）
 * · 标题走 i18n `nav.departments`（"院系设置" / "Schools"）—— **不新增 key**
 * · 站点存在性由 `[site]/layout.tsx` 的 `getSiteContext()` 保证（站点不存在/停用 → 404）
 * · **刻意不读 `searchParams`**：Next 16 里访问它会把路由降级为逐请求动态渲染，
 *   与 docs/15 §6 要求的 ISR 3600 冲突（本页没有查询参数需求）
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });

  return { title: t("departments") };
}

export default async function DepartmentsPage({ params }: { params: Promise<PageParams> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });

  // M5-1b-1 补：改走 `lib/sites.ts` 的单一实现（原先此处单独手写查询，漏了 `nameEn`
  // ⇒ `/en/main/departments` 卡片标题仍为中文；现已与首页 subSites 共用同一份 select）
  const sites = await listPublicSites({ excludeSlug: "main" });

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-gutter py-section-sm">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {t("departments")}
      </h1>

      <SiteCards sites={sites} />
    </div>
  );
}
