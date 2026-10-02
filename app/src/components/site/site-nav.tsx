import { getTranslations } from "next-intl/server";
import { cn } from "cn";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Link } from "@/i18n/navigation";
import type { NavNode } from "@/lib/site-context";

/**
 * 主导航（T2.1，docs/15 §6.1）
 * ============================================================================
 * · 数据来自 `Navigation` 表（`getSiteContext().nav`，T2.1 不接 Server Action 缓存）
 *   节点标签用**数据库里的 `name`**（导航表驱动，未走 i18n；英文字面待 T2.8 统一）
 * · 一级项：有子节点 → `NavigationMenuTrigger` + 下拉；无子节点 → 直接链接
 * · 链接有 `channelSlug` 走站内 `/[site]/[channel]`（next-intl `Link` 自动处理语言前缀）；
 *   否则用 `url`（`http(s)` 视为外链，新窗口打开）
 * · 当前页高亮 **留 T2.4**（需 `usePathname`，会把本组件拉成客户端组件）
 *
 * 组件边界：本文件是 **Server Component**；内部渲染的 `navigation-menu`（shadcn）
 * 是客户端组件，由 RSC 传数据给它是 Next 允许的组合方式。
 */

type SiteNavProps = {
  nav: NavNode[];
  siteSlug: string;
  /** 移动抽屉里用纵向排列（桌面用横向） */
  orientation?: "horizontal" | "vertical";
  /** 抽屉里点击后需要关闭（由父组件传入的关闭回调，仅客户端场景） */
  className?: string;
};

/** 解析导航节点的目标：站内栏目优先，其次 `url`（`http(s)` 或 `target=_blank` 视为外链） */
export function resolveNavHref(
  node: NavNode,
  siteSlug: string,
): { href: string; external: boolean } {
  if (node.channelSlug) {
    return { href: `/${siteSlug}/${node.channelSlug}`, external: false };
  }

  const url = node.url ?? "#";
  const external = /^https?:\/\//i.test(url) || node.target === "_blank";
  return { href: url, external };
}

export async function SiteNav({
  nav,
  siteSlug,
  orientation = "horizontal",
  className,
}: SiteNavProps) {
  if (nav.length === 0) {
    return null;
  }

  // Server Component → `getTranslations`（请求级 locale 由 [locale]/layout.tsx 的 setRequestLocale 提供）
  const t = await getTranslations("nav");

  return (
    <NavigationMenu
      aria-label={t("mainNav")}
      className={cn(orientation === "vertical" && "w-full max-w-none justify-start", className)}
    >
      <NavigationMenuList
        className={cn(orientation === "vertical" && "flex w-full flex-col items-stretch gap-1")}
      >
        {nav.map((node) => {
          const { href, external } = resolveNavHref(node, siteSlug);

          if (node.children.length === 0) {
            return (
              <NavigationMenuItem key={node.id}>
                {external ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className={navigationMenuTriggerStyle()}
                  >
                    {node.name}
                  </a>
                ) : (
                  // T2.3 修 Bug 2：原先写 `<NavigationMenuLink asChild><Link/></NavigationMenuLink>`，
                  // 在 **SSR 阶段**抛 Radix Slot 错（`Primitive.a failed to slot onto its children`）。
                  // 依据：`Primitive.a` 这一 owner 名只由 `@radix-ui/react-navigation-menu` 产生
                  // （本仓安装的 radix 里仅 hover-card / navigation-menu / toolbar 有此串），
                  // 而全仓库"锚原语 + asChild"只有本处 → 去掉 `asChild`、直接把 `Link` 放进
                  // `NavigationMenuItem`，用 shadcn 的 `navigationMenuTriggerStyle()` 保持外观一致。
                  // 代价：不再有 radix 的 `data-active`/`aria-current` —— 与 T2.1"当前页高亮留 T2.4"一致。
                  // 详见 `docs/00` §8 #52。
                  <Link href={href} className={navigationMenuTriggerStyle()}>
                    {node.name}
                  </Link>
                )}
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={node.id}>
              <NavigationMenuTrigger>{node.name}</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul
                  className={cn(
                    "grid gap-1 p-2",
                    node.children.length > 4 ? "w-[26rem] grid-cols-2" : "w-[13rem] grid-cols-1",
                  )}
                >
                  {node.children.map((child) => {
                    const resolved = resolveNavHref(child, siteSlug);
                    return (
                      <li key={child.id}>
                        {resolved.external ? (
                          <a
                            href={resolved.href}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {child.name}
                          </a>
                        ) : (
                          <Link
                            href={resolved.href}
                            className="block rounded-lg px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                          >
                            {child.name}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
