import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  compareSpecificity,
  matchesPath,
  resolveRoute,
  routePatternFromPageFile,
  type RoutePattern,
} from "@/lib/route-match";

/**
 * 路由歧义单测（**U2 裁决**，docs/15 §6.2；对应 docs/00 §8 #32 的 T1.9 待办）
 *
 * 做法（结构性断言，见 T1.9 裁决 Q6）：
 *   从真实的 `src/app` 文件树推出路由 pattern → 用纯匹配器断言
 *   ① 静态段 `news/[id]` 与动态段 `[channel]/[id]` **同时存在**（防误删静态段）
 *   ② 静态段优先：`/zh/main/news/123` 走 `news/[id]`，`/zh/main/academic/123` 走 `[channel]/[id]`
 *
 * ⚠ **`as-needed` 的 locale 语义（实测要点）**：公开 URL `/main/news/123` 只有 **3 段**
 *  （默认语言不带前缀），而 App Router 的内部 pattern 是 **4 段** `/[locale]/[site]/news/[id]`。
 *  next-intl 的拦截层会把公开 URL 内部重写为 `/zh/main/news/123` —— 因此
 *  **歧义断言必须打在重写后的内部路径上**（这正是 docs/15 §6.2 所说的"同时匹配"）。
 *
 * ⚠ 真实构建期的解析优先级已由 T1.6 的 `.next/app-path-routes-manifest.json` 实证；
 *   本用例保证的是"文件树不退化"，不替代 Next 运行时路由。
 */

const APP_DIR = path.resolve(process.cwd(), "src/app");

function collectPageFiles(dir: string, base = ""): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectPageFiles(path.join(dir, entry.name), rel));
    } else if (entry.name === "page.tsx") {
      files.push(rel);
    }
  }

  return files;
}

const patterns: RoutePattern[] = collectPageFiles(APP_DIR)
  .map((file) => routePatternFromPageFile(file))
  .filter((pattern): pattern is RoutePattern => pattern !== null);

describe("route-match：pattern 解析", () => {
  it("routePatternFromPageFile 去掉路由组与 page.tsx", () => {
    expect(routePatternFromPageFile("(site)/[locale]/[site]/news/[id]/page.tsx")).toBe(
      "/[locale]/[site]/news/[id]",
    );
    expect(routePatternFromPageFile("admin/login/page.tsx")).toBe("/admin/login");
    expect(routePatternFromPageFile("page.tsx")).toBe("/");
    expect(routePatternFromPageFile("components/button.tsx")).toBeNull();
  });

  it("matchesPath 段数与动态段语义（输入为**重写后的内部路径**）", () => {
    expect(matchesPath("/[locale]/[site]/news/[id]", "/zh/main/news/123")).toBe(true);
    expect(matchesPath("/[locale]/[site]/news", "/zh/main/news/123")).toBe(false);
    expect(matchesPath("/[locale]/[site]/notice", "/zh/main/notice")).toBe(true);
    expect(matchesPath("/[locale]/[site]/notice", "/zh/main/news")).toBe(false);
  });

  it("compareSpecificity：静态段优先", () => {
    expect(
      compareSpecificity("/[locale]/[site]/news/[id]", "/[locale]/[site]/[channel]/[id]"),
    ).toBeGreaterThan(0);
    expect(
      compareSpecificity("/[locale]/[site]/[channel]/[id]", "/[locale]/[site]/news/[id]"),
    ).toBeLessThan(0);
  });
});

describe("route-match：U2 —— /main/news/123 与 /main/academic/123", () => {
  it("文件树里静态段与动态段两条路径**同时存在**", () => {
    expect(patterns).toContain("/[locale]/[site]/news/[id]");
    expect(patterns).toContain("/[locale]/[site]/[channel]/[id]");
    expect(patterns).toContain("/[locale]/[site]/[channel]");
    expect(patterns).toContain("/[locale]/[site]/news");
  });

  it("/zh/main/news/123（重写后）解析到静态段 news/[id]（而非 [channel]/[id]）", () => {
    expect(resolveRoute("/zh/main/news/123", patterns)).toBe("/[locale]/[site]/news/[id]");
  });

  it("/zh/main/academic/123（非保留 slug）解析到动态段 [channel]/[id]", () => {
    expect(resolveRoute("/zh/main/academic/123", patterns)).toBe("/[locale]/[site]/[channel]/[id]");
  });

  it("保留 slug 的列表页仍走静态段（/zh/main/news、/zh/main/notice）", () => {
    expect(resolveRoute("/zh/main/news", patterns)).toBe("/[locale]/[site]/news");
    expect(resolveRoute("/zh/main/notice", patterns)).toBe("/[locale]/[site]/notice");
  });

  it("⚠ 公开 URL（未重写、3 段）不在本解析器语义内 —— 必须先经拦截层补 locale 段", () => {
    // /main/news/123 只有 3 段，会与 3 段的 /[locale]/[site]/[channel] 同形，
    // 因此解析器只接受"重写后的内部路径"；公开 URL 的处理属于 proxy.ts 的职责（docs/15 §5.2）。
    expect(matchesPath("/[locale]/[site]/news/[id]", "/main/news/123")).toBe(false);
    expect(resolveRoute("/main/news/123", patterns)).not.toBe("/[locale]/[site]/news/[id]");
  });

  it("未收录的路径返回 null（由 not-found 兜底）", () => {
    expect(resolveRoute("/main/unknown/deep/er/path", patterns)).toBeNull();
  });
});
