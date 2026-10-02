import { ArrowRightIcon, Building2Icon } from "lucide-react";
import { cn } from "cn";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";

/**
 * 站点/院系卡片（T2.2）—— Server Component
 * ============================================================================
 * 布局：**移动 2 列 / 桌面 4 列**（`grid-cols-2 lg:grid-cols-4`）。
 * 每张卡：站名 + 简介（可选）+ "进入 →"；链接指向该站点首页 `/[slug]`（本地化前缀由 `Link` 处理）。
 *
 * 数据来源（T2.3 组装时）：`Site` 表（`docs/15` §6 的 `/[site]` 首页一行：`listSites`）。
 */

export type SiteCardItem = {
  slug: string;
  name: string;
  description?: string | null;
};

type SiteCardsProps = {
  sites: SiteCardItem[];
  className?: string;
};

export function SiteCards({ sites, className }: SiteCardsProps) {
  if (sites.length === 0) {
    return null;
  }

  return (
    <ul className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {sites.map((site) => (
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
                <CardTitle className="text-base">{site.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3">
                {site.description ? (
                  <p className="line-clamp-3 text-sm leading-body text-muted-foreground">
                    {site.description}
                  </p>
                ) : (
                  <span />
                )}
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  进入
                  <ArrowRightIcon className="size-4" aria-hidden="true" />
                </span>
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
