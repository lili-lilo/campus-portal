import { ArrowRightIcon, Building2Icon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { localizedDescription, localizedName } from "@/lib/localized-name";
import type { SiteCardItem } from "@/lib/sites";

/**
 * 站点/院系卡片（T2.2）—— Server Component
 * ============================================================================
 * 布局：**移动 2 列 / 桌面 4 列**（`grid-cols-2 lg:grid-cols-4`）。
 * 每张卡：站名 + 简介（可选）+ "进入 →"；链接指向该站点首页 `/[slug]`（本地化前缀由 `Link` 处理）。
 *
 * 数据来源：**`@/lib/sites` 的 `listPublicSites()`**（M5-1b-1 补起为唯一实现；
 * 原先 `(site)/page.tsx` 与 `/departments` 各自手写查询，曾漏补 `nameEn`）。
 * 站名/简介双语：**M5-1b-1 / `docs/00` §8 #58** —— 走 `localizedName` / `localizedDescription`。
 */

/** 类型定义已上移到 `@/lib/sites`（与数据源同源）；此处再导出让既有 import 路径继续可用 */
export type { SiteCardItem } from "@/lib/sites";

type SiteCardsProps = {
  sites: SiteCardItem[];
  className?: string;
};

export async function SiteCards({ sites, className }: SiteCardsProps) {
  if (sites.length === 0) {
    return null;
  }

  // Server Component → `getTranslations`
  const t = await getTranslations("home");
  // M5-1b-1：#58 站点名/简介双语
  const locale = await getLocale();

  return (
    <ul className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {sites.map((site) => {
        const name = localizedName(site, locale);
        const description = localizedDescription(site, locale);

        return (
          <li key={site.slug}>
            <Link
              href={`/${site.slug}`}
              className="block h-full rounded-card focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full gap-0 border-border shadow-card transition-shadow duration-200 hover:shadow-hover">
                <CardHeader className="gap-2">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-surface text-primary">
                    <Building2Icon className="size-5" aria-hidden="true" />
                  </span>
                  <CardTitle className="text-base">{name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-3">
                  {description ? (
                    <p className="line-clamp-3 text-sm leading-body text-muted-foreground">
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
