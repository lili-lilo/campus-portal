import { describe, it } from "vitest";

/**
 * 搜索结果高亮组件测试 —— **骨架（`.skip`）**
 *
 * · 命名说明（docs/00 §8 #42/#43）：`docs/16` §1.1 的测试文件名是 `search-highlight.test.tsx`，
 *   而 §2.6 的组件名写作 `SearchResults`。两者是不同层次的组件
 *   （`SearchResults` = 整块结果列表；`SearchHighlight` = 内联高亮），**组件第 2 周交付时定名**。
 * · 断言要求（docs/16 §2.6）：高亮 `<mark>` 正确包裹，**且不注入原始 HTML**（防 XSS，docs/14 §5.16）
 */
describe.skip("SearchHighlight / SearchResults（待第 2 周搜索功能交付）", () => {
  it("高亮 <mark> 正确包裹且不注入原始 HTML", () => {
    // TODO(第 2 周)：喂入含 <script> 的命中片段，断言渲染为纯文本（无脚本节点、无 innerHTML 注入）
  });
});
