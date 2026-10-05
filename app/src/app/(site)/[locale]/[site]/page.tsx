import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { HeroCarousel, type HeroSlide } from "@/components/home/hero-carousel";
import { HomeDepartment } from "@/components/home/home-department";
import { NewsList } from "@/components/home/news-list";
import { NoticeTabs, type NoticeTab } from "@/components/home/notice-tabs";
import { QuickLinks, type QuickLinkItem } from "@/components/home/quick-links";
import { SiteCards } from "@/components/home/site-cards";
import { StatsBand } from "@/components/home/stats-band";
import { SectionHeading } from "@/components/site/section-heading";
import type { AppLocale } from "@/i18n/routing";
import { localizedName } from "@/lib/localized-name";
import { prisma } from "@/lib/prisma";
import { getSiteContext, type SiteContext } from "@/lib/site-context";
import { listPublicSites } from "@/lib/sites";

// M5-1b-2（C 类）：静态标题「首页」→ `generateMetadata`（主站用**站点名**，双语）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; site: string }>;
}): Promise<Metadata> {
  const { locale, site: siteSlug } = await params;
  const context = await getSiteContext(siteSlug);
  if (!context) {
    const t = await getTranslations({ locale, namespace: "nav" });
    return { title: t("home") };
  }

  return { title: localizedName(context.site, locale) };
}

// ISR：docs/15 §6 规定首页 revalidate = 300（动态按需渲染 + 300s 缓存，见 docs/00 §8 #49）
export const revalidate = 300;

/**
 * 首页（T2.3 组装）—— 主站模板 + 子站简化模板分流
 * ============================================================================
 * 分流：`Site.template === "department"` → `HomeDepartment`（U7 简化模板，自带查询）；
 *        否则本文件的主站模板：轮播 → 快捷入口 → 学校要闻 → 通知公告 → 院系设置。
 *
 * 数据：全部经 `@/lib/prisma` 单例**直查**（Server Component，不走 API）。
 *   站点上下文复用 `getSiteContext()`（layout 已调用，`cache()` 保证同请求只查一次）。
 * ⚠ **不加 `generateStaticParams`**：T2.1 定案 —— 保住"CI build 不需要 DB"（docs/00 §8 #49）。
 * ⚠ 本文件**不使用 `<main>`**：T2.1 已在 `[site]/layout.tsx` 渲染 `<main id="main">`（避免嵌套）。
 *
 * 文案：区块标题复用既有 i18n key（`home.latestNews` / `home.notices` / `home.quickLinks` /
 *       `nav.departments`）；组件内部的"更多""暂无内容"等仍为硬编码，归 **T2.8** 统一迁 i18n。
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

/**
 * 主站快捷入口 —— **硬编码占位**（T2.3 判断点 1 的"若无"分支）
 *
 * 依据：`Config` 表里只有 `seo.* / site.* / security.* / watermark.* / sensitive_words.*`，
 * **没有任何"快捷入口"表或字段**（已核对 seed 的 `seedConfigs()`）。
 * TODO(T2.6 / 第 3~4 周)：改由 `Config(group='site')` 或新的 Server Action 提供，届时删除本常量。
 */
/**
 * 快捷入口文案的 i18n key（T2.8 Part 1 收尾：原先 6 个 `label` 是**中文字面量**，
 * 英文站会露出中文 —— 现在改为从 `home` 命名空间取，key 在 `mainQuickLinks()` 里消费）
 */
type MainQuickLinkKey =
  "quickHall" | "quickMail" | "quickLibrary" | "quickAcademic" | "quickCard" | "quickMap";

/**
 * 主站快捷入口（6 项）—— 地址为演示占位 `#`，**不指向任何真实站点**；
 * 文案已走 i18n（`home.quick*`），故英文站显示英文。
 */
function mainQuickLinks(t: (key: MainQuickLinkKey) => string): QuickLinkItem[] {
  return [
    // 演示占位：**不指向任何真实站点**（原为 example.edu.cn 假域名 ⇒ 已改 "#"）
    { label: t("quickHall"), href: "#", icon: "landmark" },
    { label: t("quickMail"), href: "#", icon: "mail" },
    { label: t("quickLibrary"), href: "#", icon: "library" },
    { label: t("quickAcademic"), href: "#", icon: "bookopen" },
    { label: t("quickCard"), href: "#", icon: "award" },
    { label: t("quickMap"), href: "#", icon: "building2" },
  ];
}

/** 栏目树摊平（顶层 + 一级子栏目），用于按 slug 取（双语的）标签 */
function flattenChannels(context: SiteContext) {
  return [...context.channels, ...context.channels.flatMap((channel) => channel.children)];
}

export default async function SiteHomePage({
  params,
}: {
  params: Promise<{ locale: string; site: string }>;
}) {
  const { locale, site: siteSlug } = await params;

  const context = await getSiteContext(siteSlug);
  if (!context) {
    notFound();
  }

  // U7：子站走简化模板（不复用主站模板）
  if (context.site.template === "department") {
    return <HomeDepartment context={context} />;
  }

  const current: AppLocale = locale === "en" ? "en" : "zh";
  const tHome = await getTranslations({ locale: current, namespace: "home" });
  const tNav = await getTranslations({ locale: current, namespace: "nav" });

  const slug = context.site.slug;
  const now = new Date();

  const publishedWhere = {
    siteId: context.site.id,
    status: "published",
    deletedAt: null,
    OR: [{ publishTime: null }, { publishTime: { lte: now } }],
  };

  const [carouselMedia, news, noticeArticles, researchArticles, subSites] = await Promise.all([
    // ① 轮播：本站 carousel 素材最新 5 张（实测 seed 的 carousel 素材全部挂 main）
    prisma.media.findMany({
      where: { siteId: context.site.id, folder: "carousel", deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, path: true },
    }),
    // ③ 学校要闻：**只取 news 频道**（M6 批次 4a —— 原先不限频道，公文类「通知公告」也混进要闻区，
    //    既与下方「信息公告」区块重复，又会因该类文章不配图而让首页大图卡退化成渐变块）；
    //    置顶优先，其次按发布时间倒序
    prisma.article.findMany({
      where: { ...publishedWhere, channel: { slug: "news" } },
      orderBy: [{ top: "desc" }, { publishTime: "desc" }],
      take: 6,
      select: ARTICLE_SELECT,
    }),
    // ④ 通知公告 tab
    prisma.article.findMany({
      where: { ...publishedWhere, channel: { slug: "notice" } },
      orderBy: { publishTime: "desc" },
      take: 6,
      select: ARTICLE_SELECT,
    }),
    // ④ 科学研究 tab（seed 主站确实有 research 栏目 → 双 tab）
    prisma.article.findMany({
      where: { ...publishedWhere, channel: { slug: "research" } },
      orderBy: { publishTime: "desc" },
      take: 6,
      select: ARTICLE_SELECT,
    }),
    // ⑤ 院系设置：除 main 外的在营站点（实测 3 个：cs / ee / ba）
    //    M5-1b-1 补：改走 `lib/sites.ts` 的单一实现（与 /departments 页共用，含 nameEn/descriptionEn）
    listPublicSites({ excludeSlug: "main" }),
  ]);

  const slides: HeroSlide[] = carouselMedia.map((media) => ({
    id: media.id,
    title: media.name,
    image: media.path,
    // T2.2 的 `HeroSlide.link` 是必填 string；seed 的 `Media` 与文章没有直接关联
    //（关联在 `Article.mediaIds` JSON 串里，反查代价高）→ 先统一指向新闻中心。
    // TODO(第 4 周)：按 `Article.mediaIds` 反查出真实文章，或给 Media 加 `articleId`。
    link: `/${slug}/news`,
  }));

  const flatChannels = flattenChannels(context);
  // M5-1b-2 / #58：tab 标签取自 `context.channels`（已含 `nameEn`）⇒ 英文站显示栏目英文名
  const labelOf = (channelSlug: string, fallback: string) => {
    const channel = flatChannels.find((item) => item.slug === channelSlug);
    return channel ? localizedName(channel, locale) : fallback;
  };

  const noticeTabs: NoticeTab[] = [
    { key: "notice", label: labelOf("notice", "通知公告"), items: noticeArticles },
    { key: "research", label: labelOf("research", "科学研究"), items: researchArticles },
  ];

  const sites = subSites;

  return (
    <>
      {/* ① 焦点图轮播（**通栏**：移出 max-w-page 容器，M6 视觉改造批次 1；0 条则不渲染） */}
      {slides.length > 0 ? <HeroCarousel items={slides} /> : null}

      {/* ①′ 数字看板（**通栏深色**，M6 视觉改造批次 2：位于 Hero 之后、快捷入口之前） */}
      <StatsBand />

      {/* ②~⑤ 其余区块保持居中容器（间距/内边距不变） */}
      <div className="mx-auto w-full max-w-page space-y-12 px-gutter py-section-sm">
        {/* ② 快捷入口（6 项；数据源待第 3~4 周接 Config/Server Action） */}
        <section aria-label={tHome("quickLinks")}>
          <QuickLinks links={mainQuickLinks(tHome)} />
        </section>

        {/* ③ 学校要闻 */}
        <NewsList
          items={news}
          title={tHome("latestNews")}
          subtitle={tHome("newsSubtitle")}
          moreHref={`/${slug}/news`}
          siteSlug={slug}
        />

        {/* ④ 信息公告（双 tab；标题用 noticesTitle 与 tab 的「通知公告」区分开，避免同词重复） */}
        <section className="space-y-4" aria-label={tHome("noticesTitle")}>
          <SectionHeading title={tHome("noticesTitle")} subtitle={tHome("noticesSubtitle")} />
          <NoticeTabs tabs={noticeTabs} siteSlug={slug} />
        </section>

        {/* ⑤ 院系设置 */}
        <section className="space-y-4">
          <SectionHeading
            title={tNav("departments")}
            subtitle={tHome("departmentsSubtitle")}
            moreHref={`/${slug}/departments`}
          />
          <SiteCards sites={sites} />
        </section>
      </div>
    </>
  );
}
