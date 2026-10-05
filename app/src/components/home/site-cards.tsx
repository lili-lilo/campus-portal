import { ArrowRightIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "cn";

import { CoverBlock } from "@/components/article-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { localizedDescription, localizedName } from "@/lib/localized-name";
import type { SiteCardItem } from "@/lib/sites";

/**
 * 站点/院系卡片（T2.2；**M6 视觉改造批次 2 改为图片卡**）—— Server Component
 * ============================================================================
 * 布局：移动 1 列 / 平板 2 列 / 桌面 4 列。每张卡 = **16:10 配图** + 站名 + 英文名 + 简介 +「进入 →」，
 * 链接指向该站点首页 `/[slug]`（本地化前缀由 `Link` 处理）。
 * hover：图片轻微放大（`group-hover:scale-[1.03]`）+ 标题变主题色 + 卡片阴影抬升。
 *
 * 数据来源：`@/lib/sites` 的 `listPublicSites()`；站名/简介双语走 `localizedName` / `localizedDescription`。
 *
 * ⚠ 配图来源（数据现状）：seed 的 `dept` 素材**全部挂 ee 站**（`Media.siteId` 只有 ee），
 * 无法按 `siteId` 查出各子站配图 ⇒ 用**静态映射**落到三张已就位的楼体图
 * （见 `docs/明德大学-图片映射表.md`：image-048 = 计算机学院 / 043 = 电子信息学院 / 038 = 商学院）。
 * 待 seed 给 cs/ba 补 dept 素材后，可改为按 `siteId` 查询 —— `images` 覆盖入口已预留。
 * 查询不到时 `CoverBlock` 自动落渐变兜底 + 居中标题。
 */
const DEPT_COVER_BY_SLUG: Record<string, string> = {
  cs: "/uploads/seed/dept/image-048.jpg",
  ee: "/uploads/seed/dept/image-043.jpg",
  ba: "/uploads/seed/dept/image-038.jpg",
};

/** 类型定义已上移到 `@/lib/sites`（与数据源同源）；此处再导出让既有 import 路径继续可用 */
export type { SiteCardItem } from "@/lib/sites";

type SiteCardsProps = {
  sites: SiteCardItem[];
  /** 按站点 slug 覆盖配图（预留给"按 siteId 查 Media"的后续实现） */
  images?: Record<string, string | null>;
  className?: string;
};

export async function SiteCards({ sites, images, className }: SiteCardsProps) {
  if (sites.length === 0) {
    return null;
  }

  // Server Component → `getTranslations`
  const t = await getTranslations("home");
  // M5-1b-1：#58 站点名/简介双语
  const locale = await getLocale();

  return (
    <ul className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {sites.map((site, index) => {
        const name = localizedName(site, locale);
        const description = localizedDescription(site, locale);
        const cover = images?.[site.slug] ?? DEPT_COVER_BY_SLUG[site.slug] ?? null;

        return (
          <li key={site.slug} className="h-full">
            <Link
              href={`/${site.slug}`}
              className="group block h-full rounded-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full gap-0 overflow-hidden border-border pt-0 shadow-card transition-shadow duration-200 group-hover:shadow-hover">
                <CoverBlock
                  title={name}
                  cover={cover}
                  index={index}
                  className="aspect-[16/10] w-full transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <CardHeader className="gap-1 pt-6">
                  <CardTitle className="text-base transition-colors duration-200 group-hover:text-primary">
                    {name}
                  </CardTitle>
                  {site.nameEn ? (
                    <p className="text-xs tracking-widest text-muted-foreground uppercase">
                      {site.nameEn}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3">
                  {description ? (
                    <p className="line-clamp-2 text-sm leading-body text-muted-foreground">
                      {description}
                    </p>
                  ) : (
                    <span />
                  )}
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                    {t("enter")}
                    <ArrowRightIcon className="size-4" aria-hidden="true" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
