import { getLocale, getTranslations } from "next-intl/server";

import { CoverBlock } from "@/components/article-card";
import { NewsList } from "@/components/home/news-list";
import { NoticeTabs, type NoticeTab } from "@/components/home/notice-tabs";
import { QuickLinks, type QuickLinkItem } from "@/components/home/quick-links";
import { SectionHeading } from "@/components/site/section-heading";
import { localizedDescription, localizedName } from "@/lib/localized-name";
import { prisma } from "@/lib/prisma";
import type { SiteContext } from "@/lib/site-context";

/**
 * 子站首页 —— **简化模板**（U7 裁决，docs/15 §6.3）
 * ============================================================================
 * 与主站的差异（逐条对应 U7 表格）：
 *   · ❌ 全站轮播 → 换成**单张院系横幅**：`Media(folder='dept')` 有图用图，无图用 `COVER_STYLES[0]` 渐变
 *     （实测 seed：`dept` 素材 10 条**全部挂在 ee 站**，故 cs / ba 走渐变兜底）
 *   · ❌ 全站要闻 → 换成本院新闻（`siteId = 本站`）
 *   · ✅ 通知公告保留，但只显示本院内容（单 tab）
 *   · ❌ 去掉"院系设置"入口（子站自身就是院系）
 *   · ⚠ 快捷入口精简为 3 个，且**改为站内栏目**（专业介绍 / 师资队伍 / 联系方式）——数据驱动，不用外链占位
 *
 * 数据全部经 `@/lib/prisma` 单例**在本组件内直查**（Server Component，不走 API）。
 *
 * ⚠ **已知取舍（待裁决）**：seed 的子站栏目只有 `about / news / faculty / programs / research / contact`，
 * **没有独立的"通知公告"栏目** → 单 tab 只能落在 `news`（新闻动态）。因此
 * 「本院新闻」（本站全部已发布）与「本院公告」（news 栏目）会有部分重叠。备选方案见 T2.3 报告判断点 2。
 */

const ARTICLE_SELECT = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  cover: true,
  publishTime: true,
  channel: { select: { name: true, nameEn: true, slug: true } },
};

/** 子站快捷入口：站内栏目 slug + lucide 图标名（图标名由 `QuickLinks` 静态映射解析） */
const QUICK_CHANNEL_SLUGS: readonly { slug: string; icon: string }[] = [
  { slug: "programs", icon: "bookopen" },
  { slug: "faculty", icon: "users" },
  { slug: "contact", icon: "phone" },
];

type HomeDepartmentProps = {
  /** 站点上下文（由 `[site]/layout.tsx` 查库后传入；`cache()` 保证同请求只查一次） */
  context: SiteContext;
};

export async function HomeDepartment({ context }: HomeDepartmentProps) {
  const { site, channels } = context;
  // Server Component → `getTranslations`
  const t = await getTranslations("home");
  // M5-1 / #58：子站快捷入口 3 项与「本院公告」tab 标签都取自 `Channel`，英文站取 `nameEn`
  const locale = await getLocale();
  // M5-1b-1 / #58：站点名（`Site.nameEn`）—— banner 标题与 `aria-label` 同用
  const siteLabel = localizedName(site, locale);
  // M5-1b-1 补 / #58：站点简介（`Site.descriptionEn`）
  const siteDescription = localizedDescription(site, locale);
  const now = new Date();

  const publishedWhere = {
    siteId: site.id,
    status: "published",
    deletedAt: null,
    OR: [{ publishTime: null }, { publishTime: { lte: now } }],
  };

  const [banner, news, notices] = await Promise.all([
    // ① 横幅图：本站 dept 素材最新 1 张（无则 null → 组件走渐变兜底）
    prisma.media.findFirst({
      where: { siteId: site.id, folder: "dept", deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, path: true },
    }),
    // ③ 本院新闻：本站已发布最新 6 篇
    prisma.article.findMany({
      where: publishedWhere,
      orderBy: [{ top: "desc" }, { publishTime: "desc" }],
      take: 6,
      select: ARTICLE_SELECT,
    }),
    // ④ 本院公告（单 tab）：本站 news 栏目最新 6 篇
    prisma.article.findMany({
      where: { ...publishedWhere, channel: { slug: "news" } },
      orderBy: { publishTime: "desc" },
      take: 6,
      select: ARTICLE_SELECT,
    }),
  ]);

  // 栏目树摊平（顶层 + 一级子栏目），用于取站内链接与中文标签
  const flatChannels = [...channels, ...channels.flatMap((channel) => channel.children)];

  // ② 快捷入口（2~3 个）：只保留 seed 里真实存在的栏目，缺失自动省略
  const quickLinks: QuickLinkItem[] = QUICK_CHANNEL_SLUGS.flatMap(({ slug, icon }) => {
    const channel = flatChannels.find((item) => item.slug === slug);
    return channel
      ? [{ label: localizedName(channel, locale), href: `/${site.slug}/${channel.slug}`, icon }]
      : [];
  });

  const newsChannel = flatChannels.find((item) => item.slug === "news");
  const newsChannelName = newsChannel ? localizedName(newsChannel, locale) : undefined;
  const tabs: NoticeTab[] = [
    { key: "news", label: newsChannelName ?? t("deptNews"), items: notices },
  ];

  return (
    <div className="mx-auto w-full max-w-page space-y-12 px-gutter py-section-sm">
      {/* ① 院系横幅（替代全站轮播） */}
      <section
        aria-label={siteLabel}
        className="relative h-[200px] overflow-hidden rounded-card md:h-[280px]"
      >
        <CoverBlock title="" cover={banner?.path ?? null} index={0} className="absolute inset-0" />
        <div className="absolute inset-0 flex flex-col justify-center gap-2 bg-foreground/35 p-8">
          <h1 className="font-heading text-2xl font-semibold text-background md:text-4xl">
            {siteLabel}
          </h1>
          {siteDescription ? (
            <p className="max-w-2xl text-sm text-background/90 md:text-base">{siteDescription}</p>
          ) : null}
        </div>
      </section>

      {/* ② 快捷入口（精简至 3 个） */}
      {quickLinks.length > 0 ? (
        <section aria-label={t("quickLinks")}>
          <QuickLinks links={quickLinks} />
        </section>
      ) : null}

      {/* ③ 本院新闻 */}
      <NewsList
        items={news}
        title={t("deptNews")}
        moreHref={`/${site.slug}/news`}
        siteSlug={site.slug}
      />

      {/* ④ 本院公告（单 tab） */}
      <section className="space-y-4">
        <SectionHeading
          title={t("deptNotices")}
          subtitle={t("noticesSubtitle")}
          moreHref={`/${site.slug}/news`}
        />
        <NoticeTabs tabs={tabs} siteSlug={site.slug} />
      </section>

      {/* ⑤ 按 U7：不渲染"院系设置" */}
    </div>
  );
}
