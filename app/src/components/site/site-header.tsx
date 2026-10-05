import { MenuIcon, SearchIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { HeaderScroll } from "@/components/site/header-scroll";
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
import { localizedName } from "@/lib/localized-name";
import type { NavNode } from "@/lib/site-context";

/**
 * 站点页头（M6 视觉改造批次 3a：**三层化**）
 * ============================================================================
 * ① **utility 行**（`h-9` = 36px，`bg-primary` 深色，`≥md` 显示）：
 *    左 = 校训；右 = 学生 / 教职工 / 访客 + 中英切换 + 搜索图标
 * ② **主栏**（白底深字，`h-20` = 80px）：校徽（`/brand/logo.svg`，44px）+ 校名（中文 + 英文小字）
 *    + 主导航（`≥lg`）+ 移动端 搜索/菜单（`<lg`）
 * ③ **滚动压缩**：`>100px` 时主栏 80 → 64px、校徽 44 → 36、页头加阴影 —— 由 `HeaderScroll`
 *    （Client 岛）写 `data-scrolled`，本文件用 `group-data-[scrolled=true]/hdr:*` 响应，
 *    页头主体仍是 **Server Component**。
 *
 * 无障碍：保留 `#main` 跳到主内容；所有可点击元素带 `focus-visible` 环；
 * 校徽 `alt=""`（紧随其后就是校名文字，避免读屏重复播报）。
 * `href="#"` 的三项（学生/教职工/访客）是**演示占位**（故用原生 `<a>`，不经 i18n Link 前缀）。
 *
 * 既有约定保留：搜索只做视觉 + 跳转 `/site/search`；语言切换只切"目标语言的站点首页"。
 */
type SiteHeaderProps = {
  /* `nameEn` 可选：M5-1b-1 / #58 起由 `getSiteContext` 一并提供，英文站取它 */
  site: { name: string; nameEn?: string | null; slug: string };
  nav: NavNode[];
  /** `params.locale`（`string`，此处收窄为 `AppLocale`，避免 `as` 断言） */
  locale: string;
};

export async function SiteHeader({ site, nav, locale }: SiteHeaderProps) {
  const current: AppLocale = locale === "en" ? "en" : "zh";
  const other: AppLocale = current === "zh" ? "en" : "zh";
  // M5-1b-1 / #58：站点名双语（`Site.nameEn`，空则回退中文 `name`）
  const siteLabel = localizedName(site, locale);

  const tCommon = await getTranslations({ locale: current, namespace: "common" });
  const tNav = await getTranslations({ locale: current, namespace: "nav" });
  const tA11y = await getTranslations({ locale: current, namespace: "accessibility" });

  const homeHref = `/${site.slug}`;
  const searchHref = `/${site.slug}/search`;
  const langLabel = other === "en" ? "EN" : "中文";
  const focusRing =
    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none rounded-lg";

  /** 受众入口：**演示占位**（`#`），故用原生 `<a>` 避免 i18n 前缀 */
  const audience = [tCommon("forStudents"), tCommon("forFaculty"), tCommon("forVisitors")];

  return (
    <HeaderScroll>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur transition-shadow duration-200 group-data-[scrolled=true]/hdr:shadow-md">
        {/* 跳到主内容（键盘/读屏用户） */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          {tA11y("skipToContent")}
        </a>

        {/* ① utility 行（≥md；移动端隐藏） */}
        <div className="hidden bg-primary text-primary-foreground md:block">
          <div className="mx-auto flex h-9 w-full max-w-page items-center justify-between gap-4 px-gutter text-xs">
            <span className="tracking-[0.2em] text-primary-foreground/80">{tCommon("motto")}</span>

            <div className="flex items-center gap-3">
              <nav aria-label={tCommon("utilityNav")} className="flex items-center gap-3">
                {audience.map((label) => (
                  <a
                    key={label}
                    href="#"
                    className="rounded-lg text-primary-foreground/80 transition-colors duration-200 hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {label}
                  </a>
                ))}
              </nav>
              <span aria-hidden="true" className="text-primary-foreground/30">
                |
              </span>
              <Link
                href={homeHref}
                locale={other}
                className="rounded-lg text-primary-foreground/80 transition-colors duration-200 hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {langLabel}
              </Link>
              <Link
                href={searchHref}
                aria-label={tCommon("search")}
                className="rounded-lg text-primary-foreground/80 transition-colors duration-200 hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <SearchIcon className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        {/* ② 主栏（白底；滚动后 80 → 64px） */}
        <div className="mx-auto flex h-20 w-full max-w-page items-center justify-between gap-4 px-gutter transition-[height] duration-200 group-data-[scrolled=true]/hdr:h-16">
          <Link href={homeHref} className={`flex min-w-0 items-center gap-3 ${focusRing}`}>
            {/* SVG 必须 unoptimized：next.config 未开 dangerouslyAllowSVG，优化器会拒绝 SVG */}
            <Image
              src="/brand/logo.svg"
              alt=""
              width={44}
              height={44}
              unoptimized
              className="size-11 shrink-0 transition-[width,height] duration-200 group-data-[scrolled=true]/hdr:size-9"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-heading text-xl font-semibold tracking-tight text-foreground">
                {siteLabel}
              </span>
              {site.nameEn ? (
                <span className="hidden truncate text-xs tracking-[0.18em] text-muted-foreground uppercase sm:block">
                  {site.nameEn}
                </span>
              ) : null}
            </span>
          </Link>

          {/* 主导航（≥lg） */}
          <nav aria-label={tNav("mainNav")} className="hidden lg:block">
            <SiteNav nav={nav} siteSlug={site.slug} />
          </nav>

          {/* 移动端控制（<lg）：搜索 + 抽屉 */}
          <div className="flex shrink-0 items-center gap-1 lg:hidden">
            <Link
              href={searchHref}
              aria-label={tCommon("search")}
              className="flex size-10 items-center justify-center rounded-lg text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <SearchIcon className="size-5" aria-hidden="true" />
            </Link>

            <Sheet>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tCommon("menu")}
                  className="size-10"
                >
                  <MenuIcon />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[18rem]">
                <SheetHeader>
                  <SheetTitle>{siteLabel}</SheetTitle>
                  <SheetDescription>{tNav("mainNav")}</SheetDescription>
                </SheetHeader>

                <nav aria-label={tNav("mainNav")} className="mt-4 px-3">
                  <SiteNav nav={nav} siteSlug={site.slug} orientation="vertical" />
                </nav>

                <div className="mt-6 flex flex-col gap-2 px-3">
                  <Link
                    href={searchHref}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <SearchIcon className="size-4" aria-hidden="true" />
                    {tCommon("search")}
                  </Link>

                  {/* utility 行在移动端隐藏 ⇒ 受众入口收进抽屉 */}
                  {audience.map((label) => (
                    <a
                      key={label}
                      href="#"
                      className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      {label}
                    </a>
                  ))}

                  <Link
                    href={homeHref}
                    locale={other}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {langLabel}
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </HeaderScroll>
  );
}
