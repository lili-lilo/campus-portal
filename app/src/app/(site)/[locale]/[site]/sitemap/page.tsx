import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localizedName } from "@/lib/localized-name";
import { prisma } from "@/lib/prisma";
import { getSiteContext } from "@/lib/site-context";

// ISR：站点地图内容变化慢 → revalidate = 3600（与 docs/15 §6 的静态页同档）
export const revalidate = 3600;

/** 每个栏目最多列 5 篇 */
const ARTICLES_PER_CHANNEL = 5;
/** 一次取数上限（4 站点中最大者约 50 篇已发布；300 足够且防极端膨胀） */
const MAX_ARTICLES = 300;

type PageParams = { locale: string; site: string };

/**
 * 人性化站点地图（T2.6）—— `/main/sitemap`（**不是 `sitemap.xml`**，后者是 `app/sitemap.ts`）
 * ============================================================================
 * · 内容：**全部栏目树（含子栏目）** + 每栏目下**最新 5 篇**文章链接
 *   （排序 = 置顶优先 → 发布时间倒序，与列表页口径一致）
 * · 交互：`<details>/<summary>` **折叠**，**零 JS、键盘可达**（无 `'use client'`）
 * · 路径：子栏目用两段（父/子，如 `/about/history`，与 docs/15 §4.4 一致）；
 *   文章用 `/{site}/{文章所属栏目}/{slug}`（与 T2.2 `articleHref` 同规则）
 * · 文案：标题 `footer.sitemap`、空态 `common.empty`、"更多" `common.more`
 *   —— **全部复用既有 i18n key，未新增 key** ✓
 *
 * ⚠ 已知限制（无数据触发，仅记录）：若将来文章挂在**二级栏目**下，其详情 URL 需要
 *   三段路径（父/子/slug），而当前路由规格（docs/15 §4.4）只定义了「栏目 + 文章」两段。
 *   seed 的二级栏目全是 `type="page"`（无文章）⇒ 现状不受影响。
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<PageParams>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "footer" });

  return { title: t("sitemap") };
}

export default async function SitemapPage({ params }: { params: Promise<PageParams> }) {
  const { locale, site: siteSlug } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  const tCommon = await getTranslations({ locale, namespace: "common" });
  const tFooter = await getTranslations({ locale, namespace: "footer" });

  const now = new Date();
  const articles = await prisma.article.findMany({
    where: {
      siteId: context.site.id,
      status: "published",
      deletedAt: null,
      OR: [{ publishTime: null }, { publishTime: { lte: now } }],
    },
    orderBy: [{ top: "desc" }, { publishTime: "desc" }],
    take: MAX_ARTICLES,
    select: {
      id: true,
      title: true,
      slug: true,
      channelId: true,
      channel: { select: { slug: true } },
    },
  });

  // 按栏目分组，每组最多 5 条（保持查询顺序 = 置顶优先 + 最新优先）
  const grouped = new Map<string, typeof articles>();
  for (const article of articles) {
    const list = grouped.get(article.channelId) ?? [];
    if (list.length < ARTICLES_PER_CHANNEL) {
      list.push(article);
      grouped.set(article.channelId, list);
    }
  }

  // 栏目树摊平为「(栏目, 站内路径)」：顶层 = `/{site}/{slug}`；子栏目 = `/{site}/{父}/{子}`
  const groups = context.channels.flatMap((channel) => [
    { channel, href: `/${siteSlug}/${channel.slug}` },
    ...channel.children.map((child) => ({
      channel: child,
      href: `/${siteSlug}/${channel.slug}/${child.slug}`,
    })),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-gutter py-section-sm">
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
        {tFooter("sitemap")}
      </h1>

      <div className="space-y-2">
        {groups.map(({ channel, href }, index) => {
          const items = grouped.get(channel.id) ?? [];

          return (
            <details
              key={channel.id}
              open={index === 0}
              className="overflow-hidden rounded-card border border-border bg-card"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <span>{localizedName(channel, locale)}</span>
                <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
              </summary>

              <ul className="divide-y divide-border border-t border-border">
                {items.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-muted-foreground">{tCommon("empty")}</li>
                ) : (
                  items.map((article) => (
                    <li key={article.id}>
                      <Link
                        href={`/${siteSlug}/${article.channel?.slug ?? channel.slug}/${article.slug}`}
                        className="block px-4 py-3 text-sm text-foreground transition-colors duration-200 hover:bg-surface hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {article.title}
                      </Link>
                    </li>
                  ))
                )}

                <li>
                  <Link
                    href={href}
                    className="block px-4 py-3 text-sm font-medium text-primary transition-colors duration-200 hover:bg-surface hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    {tCommon("more")}
                  </Link>
                </li>
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
