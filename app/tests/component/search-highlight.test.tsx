import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildHighlights,
  escapeHtml,
  SearchHighlight,
  stripHtml,
} from "@/components/search-highlight";

/**
 * 搜索结果高亮组件测试（T2.7 解除 `.skip`）
 *
 * 对应 docs/16 §2.6：高亮 `<mark>` 正确包裹，**且不注入原始 HTML**（防 XSS，docs/14 §5.16）。
 * 命名说明（docs/00 §8 #42/#43）：`docs/16` §1.1 的测试文件名是 `search-highlight.test.tsx`，
 * §2.6 写作 `SearchResults`；两者是不同层次的组件（整块结果列表 vs 内联高亮）——
 * 本文件测的是**内联高亮** `SearchHighlight`（组件名以实现为准，见 T2.7 报告）。
 */
describe("SearchHighlight（内联高亮）", () => {
  it("渲染服务端拼接的 <mark> 片段", () => {
    const highlights = { title: ["abc"], content: ["x<mark>y</mark>z"] };

    const { container } = render(<SearchHighlight highlights={highlights} />);
    const marks = container.querySelectorAll("mark");

    // 标题片段是"未命中词的窗口"（无 mark），正文片段才含 <mark>
    expect(marks.length).toBe(1);
    expect(marks[0]?.textContent).toBe("y");
    expect(container.textContent).toContain("abc");
  });

  it("segments 数组形式同样可用（单段渲染）", () => {
    const { container } = render(<SearchHighlight segments={["命中 <mark>招生</mark> 关键词"]} />);

    expect(container.querySelector("mark")?.textContent).toBe("招生");
  });

  it("不注入原始 HTML：片段里的 <script>/<img> 已由服务端转义为文本", () => {
    const { container } = render(
      <SearchHighlight
        segments={[
          "&lt;script&gt;alert(1)&lt;/script&gt;<mark>命中</mark>&lt;img src=x onerror=alert(2)&gt;",
        ]}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe("命中");
    // 转义后的痕迹仍在（说明是"当作文本显示"，而不是被删掉后恰好没报错）
    expect(container.textContent).toContain("<script>");
  });

  it("无片段时返回 null（不渲染空容器）", () => {
    const { container } = render(<SearchHighlight segments={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("buildHighlights（服务端片段拼装，防 XSS 的关键顺序）", () => {
  it("先转义、后插 <mark>：命中词被标记，原文标签变成文本", () => {
    const segments = buildHighlights("<script>alert(1)</script> 招生 简章", "招生");

    expect(segments).toHaveLength(1);
    expect(segments[0]).toContain("<mark>招生</mark>");
    expect(segments[0]).not.toContain("<script>");
    expect(segments[0]).toContain("&lt;script&gt;");
  });

  it("大小写不敏感定位，但保留原文大小写", () => {
    const segments = buildHighlights("Admissions Guide for Students", "admissions");
    expect(segments[0]).toContain("<mark>Admissions</mark>");
  });

  it("限制片段数（max），并按出现顺序取", () => {
    const segments = buildHighlights("招生 · 招生 · 招生", "招生", { max: 2, radius: 2 });
    expect(segments).toHaveLength(2);
  });

  it("空文本 / 空关键词 → 空数组", () => {
    expect(buildHighlights("", "招生")).toEqual([]);
    expect(buildHighlights("招生", "  ")).toEqual([]);
    expect(buildHighlights(null, "招生")).toEqual([]);
  });
});

describe("escapeHtml / stripHtml（纯函数）", () => {
  it("escapeHtml 覆盖 5 个危险字符", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("stripHtml 去掉标签并压缩空白", () => {
    expect(stripHtml("<h2>标题</h2>\n<p>正文  内容</p>")).toBe("标题 正文 内容");
  });
});
