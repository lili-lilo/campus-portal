import { cache } from "react";

import { prisma } from "@/lib/prisma";

/**
 * 站点上下文（前台公共数据）—— docs/15 §6.1 / §9.1
 * ============================================================================
 * 给 `(site)/[locale]/[site]/layout.tsx` 与后续页面（T2.3 首页、T2.4 列表）共用：
 *   · `site`     —— 站点元信息（名称 / template / description）
 *   · `nav`      —— 主导航树（`Navigation` 表，按 `sort` 升序；`channelId` 有则站内链接）
 *   · `channels` —— 栏目树（`Channel` 表，**已剔除 `type='form'`**，本期不渲染表单栏目）
 *
 * 两条实现约定：
 *   1. **只用 `@/lib/prisma` 单例**，不引 Server Action（`listNavigations` 等留第 3~4 周，
 *      届时本文件改为调用它们即可，签名不变）。
 *   2. 外层用 React `cache()` 做**同一次请求内去重**：layout（Header/Footer）与页面
 *      （T2.3 起）会多次需要同一份数据，`cache()` 保证一次请求只查一遍库。
 *
 * ⚠ 本文件**不得**在构建期被调用：`[site]` 段没有 `generateStaticParams`，路由是
 *   动态按需渲染 + `revalidate` 缓存，故构建期不触碰数据库（DSH 侧没有 PostgreSQL 服务）。
 */

/** 导航树节点（由 `Navigation` 构建） */
export type NavNode = {
  id: string;
  name: string;
  /** 英文名（M5-1 / #58）；渲染走 `localizedName(node, locale)`，空则回退 `name` */
  nameEn: string | null;
  /** 站内栏目 slug；有值时优先于 `url` */
  channelSlug: string | null;
  /** 外链或自定义路径（`channelSlug` 为空时使用） */
  url: string | null;
  /** `_self` / `_blank` */
  target: string;
  children: NavNode[];
};

/** 栏目树节点（由 `Channel` 构建） */
export type ChannelNode = {
  id: string;
  name: string;
  /** 英文名（M5-1 / #58）；渲染走 `localizedName(node, locale)` */
  nameEn: string | null;
  slug: string;
  /** `list` / `page` / `link`（`form` 已在查询层剔除） */
  type: string;
  children: ChannelNode[];
};

export type SiteContext = {
  site: {
    id: string;
    slug: string;
    name: string;
    /** 英文名（M5-1b-1 / #58）；渲染走 `localizedName(site, locale)`，空则回退 `name` */
    nameEn: string | null;
    /** `default`（主站）/ `department`（子站简化模板，U7） */
    template: string;
    description: string | null;
    /** 英文简介（M5-1b-1 补 / #58）；渲染走 `localizedDescription(site, locale)`，空则回退 `description` */
    descriptionEn: string | null;
  };
  nav: NavNode[];
  channels: ChannelNode[];
};

type NavRow = {
  id: string;
  parentId: string | null;
  name: string;
  nameEn: string | null;
  url: string | null;
  target: string;
  channel: { slug: string } | null;
};

type ChannelRow = {
  id: string;
  parentId: string | null;
  name: string;
  nameEn: string | null;
  slug: string;
  type: string;
};

function buildNavTree(rows: readonly NavRow[]): NavNode[] {
  const byId = new Map<string, NavNode>();

  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      nameEn: row.nameEn,
      channelSlug: row.channel?.slug ?? null,
      url: row.url,
      target: row.target,
      children: [],
    });
  }

  const roots: NavNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) {
      continue;
    }
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function buildChannelTree(rows: readonly ChannelRow[]): ChannelNode[] {
  const byId = new Map<string, ChannelNode>();

  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      nameEn: row.nameEn,
      slug: row.slug,
      type: row.type,
      children: [],
    });
  }

  const roots: ChannelNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    if (!node) {
      continue;
    }
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * 取站点上下文；站点不存在或 `status = false` 返回 `null`（由调用方 `notFound()`）。
 */
export const getSiteContext = cache(async (siteSlug: string): Promise<SiteContext | null> => {
  const site = await prisma.site.findUnique({
    where: { slug: siteSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      nameEn: true,
      template: true,
      description: true,
      descriptionEn: true,
      status: true,
    },
  });

  if (!site || !site.status) {
    return null;
  }

  const [navRows, channelRows] = await Promise.all([
    prisma.navigation.findMany({
      where: { siteId: site.id, status: true },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: {
        id: true,
        parentId: true,
        name: true,
        nameEn: true,
        url: true,
        target: true,
        channel: { select: { slug: true } },
      },
    }),
    prisma.channel.findMany({
      where: { siteId: site.id, status: true, type: { not: "form" } },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
      select: { id: true, parentId: true, name: true, nameEn: true, slug: true, type: true },
    }),
  ]);

  return {
    site: {
      id: site.id,
      slug: site.slug,
      name: site.name,
      nameEn: site.nameEn,
      template: site.template,
      description: site.description,
      descriptionEn: site.descriptionEn,
    },
    nav: buildNavTree(navRows),
    channels: buildChannelTree(channelRows),
  };
});
