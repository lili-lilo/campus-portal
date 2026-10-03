import { prisma } from "@/lib/prisma";

/**
 * 前台站点清单（M5-1b-1 补 · 单一实现）
 * ============================================================================
 * **抽出来的原因（实测）**：`(site)/[locale]/[site]/page.tsx` 的 `subSites` 与
 * `(site)/[locale]/[site]/departments/page.tsx` 的 `sites` 是**逐字相同**的查询
 * （同样的 `where { slug: { not: "main" }, status: true }` + `orderBy createdAt asc`），
 * 但 M5-1b-1 只给前者补了 `nameEn` ⇒ 后者在 `/en/main/departments` 仍显示中文名
 * （可选字段缺失不会报错，静默回退）。两处合一后，字段增补不会再漂移。
 *
 * 字段口径：`name/nameEn` 走 `localizedName`；`description/descriptionEn` 走
 * `localizedDescription`（均在 `@/lib/localized-name`）。
 */

export type SiteCardItem = {
  slug: string;
  name: string;
  /** 英文名（M5-1b-1 / `docs/00` §8 #58）；空则回退 `name` */
  nameEn?: string | null;
  description?: string | null;
  /** 英文简介（M5-1b-1 补）；空则回退 `description` */
  descriptionEn?: string | null;
};

/** 在营站点清单（默认排除 `main`），按 `createdAt` 升序 —— 院系卡片/总览共用 */
export async function listPublicSites(
  options: { excludeSlug?: string } = {},
): Promise<SiteCardItem[]> {
  return prisma.site.findMany({
    where: {
      ...(options.excludeSlug ? { slug: { not: options.excludeSlug } } : {}),
      status: true,
    },
    orderBy: { createdAt: "asc" },
    select: {
      slug: true,
      name: true,
      nameEn: true,
      description: true,
      descriptionEn: true,
    },
  });
}
