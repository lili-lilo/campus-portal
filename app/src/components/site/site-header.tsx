import { MenuIcon, SearchIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SiteNav } from "@/components/site/site-nav";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import type { NavNode } from "@/lib/site-context";

/**
 * 站点页头（T2.1）
 * ============================================================================
 * 结构：站点名条（`bg-primary`）+ 主导航条 + 移动端搜索条
 * 组成：站点名 · 主导航（二级下拉，`SiteNav`）· 语言切换 · 搜索入口 · 移动端抽屉（`sheet`）
 *
 * 响应式（docs/08 §响应式断点）：**≥1024px（`lg`）显示完整导航**；`<1024px` 收进 `sheet` 抽屉。
 *
 * 本步**明确不做**（用户 T2.1 裁决）：
 *   · 搜索框只做"视觉 + 跳转 `/site/search`"，不做实际检索（T2.7 才接 `/api/search`）
 *   · 语言切换只做链接（`/ ↔ /en`），不做 `Accept-Language` 自动识别；且只切到"目标语言的站点首页"
 *     （保留当前深层路径需 `usePathname`，随 T2.4 一起做）
 *   · 当前页高亮留 T2.4
 *
 * 全部样式走 T1.3 token（`bg-primary` / `rounded-lg` / `max-w-page` / `px-gutter` / `py-section` …），
 * 不新造色值、不装任何包。
 */

type SiteHeaderProps = {
  site: { name: string; slug: string };
  nav: NavNode[];
  /** `params.locale`（`string`，此处收窄为 `AppLocale`，避免 `as` 断言） */
  locale: string;
};

export async function SiteHeader({ site, nav, locale }: SiteHeaderProps) {
  const current: AppLocale = locale === "en" ? "en" : "zh";
  const other: AppLocale = current === "zh" ? "en" : "zh";

  const tCommon = await getTranslations({ locale: current, namespace: "common" });
  const tNav = await getTranslations({ locale: current, namespace: "nav" });
  const tA11y = await getTranslations({ locale: current, namespace: "accessibility" });

  const homeHref = `/${site.slug}`;
  const searchHref = `/${site.slug}/search`;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      {/* 跳到主内容（键盘/读屏用户） */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        {tA11y("skipToContent")}
      </a>

      {/* ① 站点名条 */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-page items-center justify-between gap-4 px-gutter py-3">
          <Link
            href={homeHref}
            className="rounded-lg text-lg font-semibold tracking-tight transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {site.name}
          </Link>

          <div className="flex items-center gap-1">
            {/* 语言切换：仅链接（未做自动识别） */}
            <Link
              href={homeHref}
              locale={other}
              className="rounded-lg px-2 py-1 text-sm transition-colors duration-200 hover:bg-primary-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {other === "en" ? "EN" : "中文"}
            </Link>

            {/* 移动端抽屉（<1024px） */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tCommon("menu")}
                  className="text-primary-foreground hover:bg-primary-foreground/10 lg:hidden"
                >
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[18rem]">
                <SheetHeader>
                  <SheetTitle>{site.name}</SheetTitle>
                  <SheetDescription>{tNav("mainNav")}</SheetDescription>
                </SheetHeader>

                <nav aria-label={tNav("mainNav")} className="mt-4 px-3">
                  <SiteNav nav={nav} siteSlug={site.slug} orientation="vertical" />
                </nav>

                <div className="mt-6 flex flex-col gap-2 px-3">
                  <Link
                    href={searchHref}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface"
                  >
                    <SearchIcon className="size-4" />
                    {tCommon("search")}
                  </Link>
                  <Link
                    href={homeHref}
                    locale={other}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface"
                  >
                    {other === "en" ? "EN" : "中文"}
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      {/* ② 主导航条（≥1024px 显示完整导航） */}
      <div className="hidden border-t border-border/60 bg-background lg:block">
        <div className="mx-auto flex w-full max-w-page items-center justify-between gap-4 px-gutter">
          <SiteNav nav={nav} siteSlug={site.slug} />

          {/* 搜索入口：只做视觉 + 跳转（T2.7 才接实际检索） */}
          <Link
            href={searchHref}
            aria-label={tCommon("search")}
            className="my-2 flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-surface hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <SearchIcon className="size-4" />
            <span>{tCommon("search")}</span>
          </Link>
        </div>
      </div>

      {/* ③ 移动端搜索条（<1024px） */}
      <div className="border-t border-border/60 bg-background px-gutter py-2 lg:hidden">
        <Link
          href={searchHref}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <SearchIcon className="size-4" />
          {tCommon("search")}
        </Link>
      </div>
    </header>
  );
}
