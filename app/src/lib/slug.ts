/**
 * 保留 slug 规则（A19 修订版，docs/11 v1.4 / docs/15 §4.1）
 *
 * 黑名单共 10 个；其中 **8 个**已被 `docs/15` §6 的静态路由占用，
 * 由 seed 以"系统栏目"身份建立（白名单），**`search` / `sitemap` 仍禁止**。
 *
 * ⚠ 这是 docs/13 §5.3 式的"唯一实现"：`prisma/seed.ts` 必须 import 本模块，
 * 不得再内联一份（否则写入侧与校验侧会漂移）。
 */

/** 静态路由已占用的 10 个 slug（A19 黑名单） */
export const RESERVED_SLUGS = [
  "news",
  "notice",
  "about",
  "departments",
  "faculty",
  "admissions",
  "research",
  "disclosure",
  "search",
  "sitemap",
] as const;

/** 允许 seed 用作 `Channel.slug` 的 8 个（docs/15 §6 有对应静态路由） */
export const SEED_ALLOWED_RESERVED = [
  "news",
  "notice",
  "about",
  "departments",
  "faculty",
  "admissions",
  "research",
  "disclosure",
] as const;

/** 后台/校验层的错误码（docs/14 §2.2）：栏目 slug 命中保留字 */
export const SLUG_RESERVED = "SLUG_RESERVED";

export function isReservedSlug(slug: string): boolean {
  return (RESERVED_SLUGS as readonly string[]).includes(slug);
}

/** 后台新建/改栏目时的判定：命中黑名单一律拒绝（docs/15 §4.2 第③层） */
export function isSlugReservedForAdmin(slug: string): boolean {
  return isReservedSlug(slug);
}

/**
 * seed 侧的断言（docs/15 §4.2 第②层，"③关键"）：
 * 只允许 `SEED_ALLOWED_RESERVED` 内的保留 slug；命中其余保留字（`search` / `sitemap`）即抛错。
 */
export function assertSlugAllowedForSeed(slug: string, siteSlug: string): void {
  if (isReservedSlug(slug) && !(SEED_ALLOWED_RESERVED as readonly string[]).includes(slug)) {
    throw new Error(
      `[seed] 保留 slug 断言失败：site=${siteSlug} channel.slug="${slug}" 命中黑名单且不在白名单内。` +
        ` 详见 docs/15 §4.1 与 docs/11 A19（修订版仅允许 ${SEED_ALLOWED_RESERVED.join(" / ")}）。`,
    );
  }
}
