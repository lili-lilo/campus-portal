import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { A11yToggle } from "@/components/a11y-toggle";
import { resolveNavHref } from "@/components/site/site-nav";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { localizedDescription, localizedName } from "@/lib/localized-name";
import type { NavNode } from "@/lib/site-context";

/**
 * 站点页脚（M6 视觉改造批次 3b：**深色通栏 + 4 列**）
 * ============================================================================
 * ① 校徽（白色底片内嵌单色 `logo-mark.svg`，深色底上不可见纯色 SVG 故加白片）
 *    + 校名（中文 + 英文小字）+ 站点简介
 * ② 快速链接：`>Navigation` 表前 6 项（与主导航**同源**，双语走 `localizedName`）
 * ③ 服务链接：教务 / 图书馆 / 邮箱 / 一卡通 —— **演示占位 `#`**（故用原生 `<a>`，不经 i18n 前缀）
 * ④ 联系方式（地址/电话/邮箱，均为演示占位）+ **二维码占位方块** + 无障碍入口
 * ⑤ 版权条：版权 + 合规声明 + 无备案号说明
 *
 * 无障碍入口：**复用 `A11yToggle`**，但组件按浅色底设计 ⇒ 放进 `bg-background` 浅色片内
 * （深色底上直接渲染会出现"深字压深蓝"不可读）。折叠仍用原生 `<details>`（零 JS、键盘可用）。
 *
 * 数据源：`Navigation` 表（`getSiteContext().nav`）+ `Site`（名称/简介）；**未接 Server Action 缓存**。
 */
type SiteFooterProps = {
  /* `nameEn` 可选：M5-1b-1 / #58 起由 `getSiteContext` 一并提供 */
  site: { name: string; nameEn?: string | null; slug: string; description: string | null };
  nav: NavNode[];
  locale: string;
};

export async function SiteFooter({ site, nav, locale }: SiteFooterProps) {
  const current: AppLocale = locale === "en" ? "en" : "zh";
  const t = await getTranslations({ locale: current, namespace: "footer" });
  const tHome = await getTranslations({ locale: current, namespace: "home" });
  const tA11y = await getTranslations({ locale: current, namespace: "accessibility" });

  // M5-1b-1 补 / #58：站点名 + 站点简介双语（`Site.nameEn` / `Site.descriptionEn`）
  const siteDescription = localizedDescription(site, locale);

  const quickNav = nav.slice(0, 6);

  /** 服务链接：**演示占位 `#`**（复用首页快捷入口的文案 key） */
  const services = [
    tHome("quickAcademic"),
    tHome("quickLibrary"),
    tHome("quickMail"),
    tHome("quickCard"),
  ];

  const linkClass =
    "rounded-lg text-sm text-primary-foreground/70 transition-colors duration-200 hover:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

  return (
    <footer className="mt-auto bg-primary text-primary-foreground">
      <div className="mx-auto w-full max-w-page px-gutter py-section-sm">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* ① 校徽 + 校名 + 简介 */}
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-background p-1">
                {/* SVG 需 unoptimized（next.config 未开 dangerouslyAllowSVG） */}
                <Image
                  src="/brand/logo-mark.svg"
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="size-10"
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-heading text-base font-semibold">
                  {localizedName(site, locale)}
                </span>
                {site.nameEn ? (
                  <span className="truncate text-xs tracking-[0.18em] text-primary-foreground/60 uppercase">
                    {site.nameEn}
                  </span>
                ) : null}
              </span>
            </div>
            {siteDescription ? (
              <p className="mt-4 max-w-prose text-sm leading-body text-primary-foreground/70">
                {siteDescription}
              </p>
            ) : null}
          </div>

          {/* ② 快速链接（导航表前 6 项） */}
          <div>
            <h2 className="text-sm font-semibold">{t("quickLinks")}</h2>
            <ul className="mt-4 space-y-2">
              {quickNav.map((node) => {
                const { href, external } = resolveNavHref(node, site.slug);
                // M5-1 / #58：页脚快捷导航与主导航同源（`Navigation` 表），同样按 locale 取名
                const nodeLabel = localizedName(node, locale);
                return (
                  <li key={node.id}>
                    {external ? (
                      <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
                        {nodeLabel}
                      </a>
                    ) : (
                      <Link href={href} className={linkClass}>
                        {nodeLabel}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ③ 服务链接（演示占位） */}
          <div>
            <h2 className="text-sm font-semibold">{t("services")}</h2>
            <ul className="mt-4 space-y-2">
              {services.map((label) => (
                <li key={label}>
                  <a href="#" className={linkClass}>
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ④ 联系方式 + 二维码占位 + 无障碍入口 */}
          <div>
            <h2 className="text-sm font-semibold">{t("contact")}</h2>
            <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
              <li className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{t("address")}</span>
              </li>
              <li className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0" aria-hidden="true" />
                {/* 值暂为占位（在 messages 里），第 3~4 周改读 Config(group='site') */}
                <span>{t("phone")}</span>
              </li>
              <li className="flex items-center gap-2">
                <MailIcon className="size-4 shrink-0" aria-hidden="true" />
                <span>{t("email")}</span>
              </li>
            </ul>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              {/* 二维码占位方块（不指向任何真实账号） */}
              <span className="flex size-20 items-center justify-center rounded-lg border border-dashed border-primary-foreground/30 p-2 text-center text-[10px] leading-tight text-primary-foreground/60">
                {t("qrHint")}
              </span>

              {/* 无障碍入口：A11yToggle 按浅色底设计 ⇒ 放进浅色片 */}
              <details className="rounded-lg bg-background p-3 text-foreground">
                <summary className="cursor-pointer rounded-lg text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  {tA11y("title")}
                </summary>
                <div className="mt-3">
                  <A11yToggle />
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      {/* ⑤ 版权条 */}
      <div className="border-t border-primary-foreground/15">
        <div className="mx-auto flex w-full max-w-page flex-col items-start justify-between gap-2 px-gutter py-4 text-xs text-primary-foreground/60 sm:flex-row sm:items-center">
          {/* 合规声明：技术演示项目，不冒充真实教育机构 */}
          <p>
            {t("copyright")}
            <span className="ml-2 text-primary-foreground/50">{t("disclaimer")}</span>
          </p>
          <p>{t("icp")}</p>
        </div>
      </div>
    </footer>
  );
}
