import type { MetadataRoute } from "next";

/**
 * /sitemap.xml（docs/15 §7.1 / A23）
 *
 * T1.6 为骨架：站点与路径用临时常量拼装，**构建期不加载 Prisma**
 *（MetadataRoute 默认在构建时执行；DSH 侧 node 与 better-sqlite3 的 ABI 不匹配）。
 * TODO(T1.10)：改为查 Site(status=true) → Channel(status=true, type≠form) →
 *   Article(status='published', deletedAt=null) + Page(status='published')，
 *   并按 docs/15 §7.1 的 changeFrequency 规则（首页 daily / 列表 daily / 详情 weekly / 单页 monthly）。
 */
const SITE_SLUGS = ["main", "cs", "ee", "ba"] as const;

const STATIC_PATHS: ReadonlyArray<{
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
}> = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/news", changeFrequency: "daily", priority: 0.9 },
  { path: "/notice", changeFrequency: "daily", priority: 0.8 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/departments", changeFrequency: "monthly", priority: 0.5 },
  { path: "/faculty", changeFrequency: "monthly", priority: 0.5 },
  { path: "/admissions", changeFrequency: "monthly", priority: 0.7 },
  { path: "/research", changeFrequency: "monthly", priority: 0.5 },
  { path: "/disclosure", changeFrequency: "monthly", priority: 0.4 },
];

const NON_DEFAULT_LOCALE_PREFIX = "/en";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const lastModified = new Date("2026-10-01T00:00:00.000Z");
  const entries: MetadataRoute.Sitemap = [];

  for (const site of SITE_SLUGS) {
    for (const item of STATIC_PATHS) {
      entries.push({
        url: `${siteUrl}/${site}${item.path}`,
        lastModified,
        changeFrequency: item.changeFrequency,
        priority: item.priority,
        // 非默认语言另出 /en/... 条目（docs/15 §7.1）
        alternates: {
          languages: {
            zh: `${siteUrl}/${site}${item.path}`,
            en: `${siteUrl}${NON_DEFAULT_LOCALE_PREFIX}/${site}${item.path}`,
          },
        },
      });
      entries.push({
        url: `${siteUrl}${NON_DEFAULT_LOCALE_PREFIX}/${site}${item.path}`,
        lastModified,
        changeFrequency: item.changeFrequency,
        priority: item.priority,
      });
    }
  }

  return entries;
}
