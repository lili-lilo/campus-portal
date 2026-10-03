import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/admin/status-badge";

/**
 * `StatusBadge` 组件测试 —— **T3.3 起真跑**（原为 `.skip` 骨架）
 *
 * · 断言要求（docs/16 §2.6 L192）：6 种状态各有**可区分**的文案（不是 6 个颜色相近的灰块）
 * · 期望文案按 `docs/13` §7.1 L119-L124 **在本文件独立硬编码**（不复用实现里的 Map），
 *   这样实现把文案写错时测试会失败
 * · 裁决 T3（docs/16 §6 L364）：组件测试**只做 3 个**，本文件是其中之一
 *   （另两个：`audit-timeline`（第 4 周）、`search-highlight`（T2.7 已真跑））
 */
const EXPECTED: ReadonlyArray<readonly [status: string, label: string]> = [
  ["draft", "草稿"],
  ["pending_first", "待初审"],
  ["pending_final", "待终审"],
  ["published", "已发布"],
  ["rejected", "已退回"],
  ["withdrawn", "已撤稿"],
];

describe("StatusBadge（6 态，T3.3 真跑）", () => {
  for (const [status, label] of EXPECTED) {
    it(`status=${status} 渲染「${label}」（docs/13 §7.1）`, () => {
      render(<StatusBadge status={status} />);

      expect(screen.getByText(label)).toBeInTheDocument();
    });
  }

  it("6 段文案互不相同，且逐字等于 docs/13 §7.1 的中文名", () => {
    const rendered = EXPECTED.map(
      ([status]) => render(<StatusBadge status={status} />).container.textContent,
    );

    expect(rendered).toEqual(EXPECTED.map(([, label]) => label));
    expect(new Set(rendered).size).toBe(EXPECTED.length);
  });

  it("未知 status 回显原值且不抛错（T3.3 裁决 Q5）", () => {
    render(<StatusBadge status="archived_unknown" />);

    expect(screen.getByText("archived_unknown")).toBeInTheDocument();
  });
});
