import { describe, it } from "vitest";

/**
 * `StatusBadge` 组件测试 —— **骨架（`.skip`）**
 *
 * · 交付时机：组件本身在第 2~5 周落地（docs/09 组件清单）
 * · 裁决 T3（docs/16 §6）：组件测试**只做 3 个**，本文件是其中之一
 * · 断言要求（docs/16 §2.6）：6 种状态各有**可区分**的文案（不是 6 个颜色相近的灰块）
 */
describe.skip("StatusBadge（待第 2~5 周组件交付）", () => {
  it("6 种状态各有可区分文案", () => {
    // TODO(第 2~5 周)：render(<StatusBadge status="draft|pending_first|pending_final|published|rejected|withdrawn" />)
    //   断言 6 段文案互不相同，且与 docs/13 §7.1 的中文名一致
  });
});
