import { describe, expect, it } from "vitest";

import {
  assertSlugAllowedForSeed,
  isReservedSlug,
  isSlugReservedForAdmin,
  RESERVED_SLUGS,
  SEED_ALLOWED_RESERVED,
  SLUG_RESERVED,
} from "@/lib/slug";

/**
 * 保留 slug 单测（docs/16 §2.5 + A19 修订版）
 *   · 黑名单 10 个；seed 白名单 8 个（`search` / `sitemap` 仍禁）
 *   · 后台侧仍拒绝**全部**黑名单（docs/15 §4.2 第③层）
 */
describe("slug：A19 修订版黑名单/白名单", () => {
  it("黑名单 10 个、seed 白名单 8 个（差额恰是 search / sitemap）", () => {
    expect(RESERVED_SLUGS).toHaveLength(10);
    expect(SEED_ALLOWED_RESERVED).toHaveLength(8);
    const diff = RESERVED_SLUGS.filter(
      (slug) => !(SEED_ALLOWED_RESERVED as readonly string[]).includes(slug),
    );
    expect(diff).toEqual(["search", "sitemap"]);
  });

  it("isReservedSlug 识别保留字", () => {
    expect(isReservedSlug("news")).toBe(true);
    expect(isReservedSlug("about")).toBe(true);
    expect(isReservedSlug("sitemap")).toBe(true);
    expect(isReservedSlug("programs")).toBe(false);
    expect(isReservedSlug("academic")).toBe(false);
  });

  it("错误码常量（docs/14 §2.2）", () => {
    expect(SLUG_RESERVED).toBe("SLUG_RESERVED");
  });
});

describe("slug：seed 侧断言（docs/15 §4.2 第②层）", () => {
  it("白名单内的保留 slug 允许（8 个静态路由对应的系统栏目）", () => {
    for (const slug of SEED_ALLOWED_RESERVED) {
      expect(() => assertSlugAllowedForSeed(slug, "main")).not.toThrow();
    }
  });

  it("search / sitemap 命中即抛错终止", () => {
    expect(() => assertSlugAllowedForSeed("search", "main")).toThrow(/保留 slug 断言失败/);
    expect(() => assertSlugAllowedForSeed("sitemap", "cs")).toThrow(/保留 slug 断言失败/);
  });

  it("非保留 slug 一律放行（子站的 programs / contact）", () => {
    expect(() => assertSlugAllowedForSeed("programs", "cs")).not.toThrow();
    expect(() => assertSlugAllowedForSeed("contact", "ba")).not.toThrow();
  });
});

describe("slug：后台侧判定（docs/15 §4.2 第③层）", () => {
  it("后台拒绝**全部**黑名单（含 seed 白名单里的那 8 个）", () => {
    for (const slug of RESERVED_SLUGS) {
      expect(isSlugReservedForAdmin(slug)).toBe(true);
    }
    expect(isSlugReservedForAdmin("programs")).toBe(false);
  });
});
