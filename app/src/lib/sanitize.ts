import sanitizeHtmlLib from "sanitize-html";

/**
 * 富文本清洗（T2.5）—— A30 / docs/14 §5.16
 * ============================================================================
 * Prisma schema 对 `Article.content` 的注释写明"写入前经 sanitize-html 清洗"（A30）。
 * 展示侧再做**一次**白名单清洗（纵深防御）：写到库里的内容可能来自后台粘贴，
 * 而渲染用 `dangerouslySetInnerHTML`，绝不能把原始 HTML 直接下发。
 *
 * 白名单与 seed 生成的内容标签集对齐（`prisma/seed.ts` 里正文只有
 * `<h2>` + `<p>` + 少量列表/链接/图片），需要时由白名单**显式**放开。
 *
 * 明确**不**允许：`style` / `class`（不在 `allowedAttributes` → 一律剥离）、
 * `script` / `iframe` / `object` / `embed`（不在 `allowedTags` → 丢弃；
 * 且 sanitize-html 默认把 `script`/`style` 归入 `nonTextTags`，**连同内容一起删掉**）。
 */

/** 允许的标签（与 seed 的标签集对齐；docs/14 §5.16） */
export const ALLOWED_TAGS = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "br",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "figure",
  "figcaption",
] as const;

const OPTIONS: sanitizeHtmlLib.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  // 只保留列出的属性；`style` / `class` 不在其中 → 被剥离
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height"],
  },
  // 只允许安全协议（显式写死，避免依赖版本默认值变化）
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // 禁止 `//example.com` 这类协议相对 URL
  allowProtocolRelative: false,
  // 不在白名单的标签：丢弃标签本身（`script`/`style` 的内容也一并丢弃）
  disallowedTagsMode: "discard",
  // 加固（T2.7）：`target="_blank"` 且未显式给 rel 时，自动补 `noopener noreferrer`
  // （不覆盖已有的 rel —— 调用方显式声明时以调用方为准）
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: "a",
      attribs: {
        ...attribs,
        ...(attribs.target === "_blank" && !attribs.rel ? { rel: "noopener noreferrer" } : {}),
      },
    }),
  },
};

/** 清洗富文本 HTML（白名单之外一律剥离） */
export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, OPTIONS);
}
