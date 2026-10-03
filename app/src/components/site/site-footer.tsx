import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { A11yToggle } from "@/components/a11y-toggle";
import { resolveNavHref } from "@/components/site/site-nav";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { localizedDescription, localizedName } from "@/lib/localized-name";
import type { NavNode } from "@/lib/site-context";

/**
 * 站点页脚（T2.1）
 * ============================================================================
 * 组成：站点简介 + 地址 · 快捷导航（取 `Navigation` 前 6 项）· 联系方式 · 无障碍入口
 *       末条：版权（i18n `footer.copyright`）+ 备案号 + 站点标识
 *
 * 无障碍入口：**复用现有 `A11yToggle`（T1.3）**，放进原生 `<details>` 折叠（零 JS、键盘可用）。
 * 未采用"指向 `/tokens`"的方案：`(dev)/tokens` 的搬迁是未结项 U-H，路径随时会变（见 `docs/00` §8）。
 *
 * 数据源：`Navigation` 表（`getSiteContext().nav`）+ `Site`（名称/简介）。**未接 Server Action 缓存**（T2.1 约定）。
 * 未做项（T2.1 裁决）：联系方式与备案号暂为占位常量（TODO(T2.8) 迁 i18n、第 3~4 周改读 `Config(group='site')`）。
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
  const tA11y = await getTranslations({ locale: current, namespace: "accessibility" });

  // M5-1b-1 补 / #58：站点名 + 站点简介双语（`Site.nameEn` / `Site.descriptionEn`）
  const siteDescription = localizedDescription(site, locale);

  const quickNav = nav.slice(0, 6);

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-page px-gutter py-section-sm">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* ① 站点简介 + 地址 */}
          <div className="lg:col-span-2">
            <p className="text-base font-semibold text-foreground">{localizedName(site, locale)}</p>
            {siteDescription ? (
              <p className="mt-2 max-w-prose text-sm leading-body text-muted-foreground">
                {siteDescription}
              </p>
            ) : null}
            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t("address")}</span>
            </p>
          </div>

          {/* ② 快捷导航（导航表前 6 项） */}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("sitemap")}</h2>
            <ul className="mt-3 space-y-2">
              {quickNav.map((node) => {
                const { href, external } = resolveNavHref(node, site.slug);
                // M5-1 / #58：页脚快捷导航与主导航同源（`Navigation` 表），同样按 locale 取名
                const nodeLabel = localizedName(node, locale);
                return (
                  <li key={node.id}>
                    {external ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {nodeLabel}
                      </a>
                    ) : (
                      <Link
                        href={href}
                        className="rounded-lg text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {nodeLabel}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* ③ 联系方式 + 无障碍入口 */}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t("contact")}</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
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

            <details className="mt-4">
              <summary className="cursor-pointer rounded-lg text-sm font-semibold text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                {tA11y("title")}
              </summary>
              <div className="mt-3">
                <A11yToggle />
              </div>
            </details>
          </div>
        </div>
      </div>

      {/* ④ 版权条 */}
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-page flex-col items-start justify-between gap-2 px-gutter py-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>{t("copyright")}</p>
          {/* 备案号为占位值（见 messages 的 footer.icp），上线前必须替换为真实备案号 */}
          <p>{t("icp")}</p>
        </div>
      </div>
    </footer>
  );
}
