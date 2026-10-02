import { cn } from "cn";

/**
 * 搜索结果高亮（T2.7）—— Server Component + 高亮拼装的**纯函数**
 * ============================================================================
 * 防 XSS 的核心约定（docs/14 §5.16）：
 *   **命中片段由服务端拼接**，且拼接顺序是「**先转义、后插 `<mark>`**」——
 *   任何来自文章内容/标题的子串都先经 `escapeHtml()`，输出的原始 HTML 只有
 *   我们自己生成的字面量 `<mark>` / `</mark>`。因此这里**不返回原始 HTML**，
 *   前端拿到的是"已安全的富文本片段"。
 *
 * ⚠ 本文件**刻意不 import `@/lib/prisma`**：它要能被 Vitest 组件测试直接导入
 *   （DSH 侧 better-sqlite3 的 ABI 与 Node 24 不符，一旦在导入期实例化 Prisma 就会崩）。
 *   数据查询放在 `src/app/api/search/route.ts`；将来若把查询抽到 `src/lib/search.ts`，
 *   本文件仍应保持"纯展示 + 纯函数"。
 */

/** 服务端产出的高亮片段（`docs/14` §5.16 的 `SearchHit.highlights`） */
export type SearchHighlights = {
  title: string[];
  content: string[];
};

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** HTML 转义（用于把任意文本安全地放进片段里） */
export function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => ESCAPE_MAP[char] ?? char);
}

/** 富文本 → 纯文本投影（用于在正文里找片段；结果仍会被转义，故标签剥离只是"好看"） */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 生成高亮片段：在 `text` 里找出 `query` 的每一处命中，各取左右 `radius` 个字符，
 * 转义后用 `<mark>` 包裹命中词；最多 `max` 段（默认 2），段间由调用方拼接展示。
 */
export function buildHighlights(
  text: string | null | undefined,
  query: string,
  options: { max?: number; radius?: number } = {},
): string[] {
  const max = options.max ?? 2;
  const radius = options.radius ?? 40;
  const source = text ?? "";
  const needle = query.trim();

  if (!source || !needle) {
    return [];
  }

  const haystack = source.toLowerCase();
  const lowered = needle.toLowerCase();
  const segments: string[] = [];
  let cursor = 0;

  while (segments.length < max) {
    const hit = haystack.indexOf(lowered, cursor);
    if (hit < 0) {
      break;
    }

    const start = Math.max(0, hit - radius);
    const end = Math.min(source.length, hit + needle.length + radius);

    // ⚠ 顺序不可颠倒：三段各自转义后才拼 `<mark>`
    const before = escapeHtml(source.slice(start, hit));
    const match = escapeHtml(source.slice(hit, hit + needle.length));
    const after = escapeHtml(source.slice(hit + needle.length, end));
    const leading = start > 0 ? "…" : "";
    const trailing = end < source.length ? "…" : "";

    segments.push(`${leading}${before}<mark>${match}</mark>${after}${trailing}`);
    cursor = hit + needle.length;
  }

  return segments;
}

type SearchHighlightProps = {
  /** 片段数组（推荐用法：`highlights.content` 或 `highlights.title`） */
  segments?: string[];
  /** 也可直接传整个 `SearchHit.highlights`（标题片段在前、正文片段在后） */
  highlights?: SearchHighlights;
  className?: string;
};

/**
 * 渲染高亮片段（内联 `<span>`）。输入已由 `buildHighlights()` 转义 + 拼接，
 * 故此处直接用 `dangerouslySetInnerHTML`，**前端不再 sanitize**（docs/14 §5.16）。
 */
export function SearchHighlight({ segments, highlights, className }: SearchHighlightProps) {
  const list = segments ?? [...(highlights?.title ?? []), ...(highlights?.content ?? [])];

  if (list.length === 0) {
    return null;
  }

  return (
    <span
      // ⚠ `<mark>` 的样式**必须显式声明**：Tailwind v4 的 Preflight 把 `mark` 的
      //   浏览器默认样式（黄底黑字）清掉了，不写就是"透明底 + 继承字色"。
      //   这里用任意变体 `[&_mark]:…` 就地指定，**不动 globals.css**（T1.3 冻结）。
      //   （若其它组件也要用 `<mark>`，需各自声明或后续统一抽成工具类，见 docs/00 §8 #54）
      className={cn("[&_mark]:bg-yellow-200 [&_mark]:text-foreground", className)}
      dangerouslySetInnerHTML={{ __html: list.join(" … ") }}
    />
  );
}
