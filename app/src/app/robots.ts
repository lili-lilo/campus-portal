import type { MetadataRoute } from "next";

/**
 * /robots.txt（docs/15 §7.2 / A23）
 *
 * T1.6 为骨架：用规格里的默认内容，**构建期不加载 Prisma**。
 * TODO(T1.10)：改为读 Config(group='seo')（key 如 seo.robots.disallow）。
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // 后台与接口必须禁止索引
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
