import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * 单页数据加载器（T2.6）—— `Page` 表（`Channel.type = "page"`）
 * ============================================================================
 * 前台只允许读到**对外可见**的单页（口径与文章一致，docs/13 C5）：
 *   `status = "published"` + `deletedAt = null`
 * （`Page` 不参与审核流、也没有 `publishTime` 定时发布字段 —— 见 schema §Page）
 *
 * slug 解析（两种都支持，`docs/14` §4.1 的 pages 端点口径）：
 *   · `Page.slug`（seed 里 = 栏目 slug，如 `history`）
 *   · 或**栏目 slug**（`Page.channel.slug`，如 `history`）
 *   两者在 seed 里一致，但支持双匹配可兼容"后台把 Page.slug 改成自定义值"的情形。
 *
 * `getPublicPage` 用 React `cache()` 包裹：同一次请求内 `generateMetadata()` 与页面正文
 * **只查一次库**（与 T2.5 `fetchArticleDetail` 同款约定）。
 */

export type PublicPage = {
  id: string;
  title: string;
  slug: string;
  content: string;
  updatedAt: Date;
  publishedAt: Date | null;
  channel: { name: string; nameEn?: string | null; slug: string } | null;
};

/**
 * 按 `siteId` + `slug`（或栏目 slug）取单页；不存在/未发布/已删除 → `null`（调用方 `notFound()`）。
 */
export const getPublicPage = cache(
  async (options: { siteId: string; slug: string }): Promise<PublicPage | null> =>
    prisma.page.findFirst({
      where: {
        siteId: options.siteId,
        status: "published",
        deletedAt: null,
        OR: [{ slug: options.slug }, { channel: { slug: options.slug } }],
      },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        updatedAt: true,
        publishedAt: true,
        channel: { select: { name: true, nameEn: true, slug: true } },
      },
    }),
);
