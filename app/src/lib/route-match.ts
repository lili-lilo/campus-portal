/**
 * 路由匹配 —— **纯函数**（docs/15 §4.2 的 U2 消歧：静态段优先）
 *
 * 用途：给 `tests/unit/route-matching.test.ts` 提供可断言的实现 ——
 *   · 从 `src/app` 的文件树推出路由 pattern（去掉路由组与 `page.tsx`）
 *   · 按 Next.js 的文件路由规则（**静态段 > 动态段**）解析路径
 *
 * ⚠ 这是**结构性断言**：真实构建期的解析优先级已由 T1.6 的
 * `.next/app-path-routes-manifest.json` 实证（`/[locale]/[site]/news/[id]` 与
 * `/[locale]/[site]/[channel]/[id]` 并存）。本模块只保证"文件树不退化"，
 * 不替代 Next 运行时路由（见 docs/00 §8 #32 与 T1.9 裁决）。
 */

export type RoutePattern = string;

const GROUP_SEGMENT = /^\(.*\)$/;

/** `page.tsx` 文件路径 → 路由 pattern（去掉路由组 `(...)` 与 `page.tsx`） */
export function routePatternFromPageFile(relativePath: string): RoutePattern | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");

  if (normalized !== "page.tsx" && !normalized.endsWith("/page.tsx")) {
    return null;
  }

  const dir = normalized.replace(/\/?page\.tsx$/, "");
  const segments = dir
    .split("/")
    .filter(Boolean)
    .filter((segment) => !GROUP_SEGMENT.test(segment));

  return `/${segments.join("/")}`;
}

export function patternToSegments(pattern: RoutePattern): string[] {
  return pattern.split("/").filter(Boolean);
}

/** 该段是否为动态段（`[id]` / `[...slug]`） */
export function isDynamicSegment(segment: string): boolean {
  return segment.startsWith("[");
}

/** 段数相同才可能匹配；动态段吃任意值 */
export function matchesPath(pattern: RoutePattern, pathname: string): boolean {
  const p = patternToSegments(pattern);
  const path = pathname.split("?")[0]?.split("/").filter(Boolean) ?? [];

  if (p.length !== path.length) {
    return false;
  }

  return p.every((segment, index) => isDynamicSegment(segment) || segment === path[index]);
}

/**
 * 静态段优先（Next.js 文件路由规则）：逐段比较，先出现静态段者胜。
 * 返回 >0 表示 `a` 更具体，<0 表示 `b` 更具体，0 表示等价。
 */
export function compareSpecificity(a: RoutePattern, b: RoutePattern): number {
  const sa = patternToSegments(a);
  const sb = patternToSegments(b);
  const len = Math.min(sa.length, sb.length);

  for (let i = 0; i < len; i += 1) {
    const da = isDynamicSegment(sa[i] ?? "");
    const db = isDynamicSegment(sb[i] ?? "");
    if (da !== db) {
      return da ? -1 : 1;
    }
  }

  return 0;
}

/** 解析路径 → 命中的路由 pattern（多条命中时取最具体的静态段优先者）；无命中返回 null */
export function resolveRoute(
  pathname: string,
  patterns: readonly RoutePattern[],
): RoutePattern | null {
  const hits = patterns.filter((pattern) => matchesPath(pattern, pathname));

  if (hits.length === 0) {
    return null;
  }

  return hits.reduce((best, current) => (compareSpecificity(current, best) > 0 ? current : best));
}
