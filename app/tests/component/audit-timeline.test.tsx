import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuditTimeline } from "@/components/admin/audit-timeline";

import type { AuditRecordItem } from "@/app/admin/articles/actions";

/**
 * `AuditTimeline` 组件测试 —— **T4.1b 起真跑**（原为 `.skip` 骨架）
 *
 * · 断言要求（docs/16 §2.6 L193）：能按 `fromStatus → toStatus` 渲染流转文案，
 *   且 `reject` 必须区分**初审退回**与**终审退回**（`step` 相同、`fromStatus` 不同）
 * · 裁决 T3（docs/16 §6 L364）：组件测试只做 3 个 —— 本文件 + `status-badge`（T3.3 真跑）
 *   + `search-highlight`（T2.7 真跑），至此**三个全部真跑**
 * · `AuditRecordItem` 只作类型导入（`actions.ts` 是 `'use server'` 模块，`import type` 编译期擦除）
 */

function record(overrides: Partial<AuditRecordItem> & { id: string }): AuditRecordItem {
  return {
    step: "submit",
    fromStatus: "draft",
    toStatus: "pending_first",
    operatorName: "张老师",
    role: "editor",
    comment: null,
    createdAt: new Date("2026-10-03T10:00:00Z"),
    ...overrides,
  };
}

describe("AuditTimeline（T4.1b 真跑）", () => {
  it("按 fromStatus → toStatus 渲染流转文案 + step 中文 + 操作人", () => {
    render(
      <AuditTimeline
        records={[
          record({ id: "r1", step: "submit", fromStatus: "draft", toStatus: "pending_first" }),
        ]}
      />,
    );

    expect(screen.getByText("草稿 → 待初审")).toBeInTheDocument();
    expect(screen.getByText("提交")).toBeInTheDocument();
    expect(screen.getByText("张老师")).toBeInTheDocument();
  });

  it("reject 区分初审退回 / 终审退回（step 相同、fromStatus 不同）", () => {
    render(
      <AuditTimeline
        records={[
          record({ id: "r1", step: "reject", fromStatus: "pending_first", toStatus: "rejected" }),
          record({ id: "r2", step: "reject", fromStatus: "pending_final", toStatus: "rejected" }),
        ]}
      />,
    );

    const firstReject = screen.getByText("初审退回");
    const finalReject = screen.getByText("终审退回");

    expect(firstReject).toBeInTheDocument();
    expect(finalReject).toBeInTheDocument();
    expect(firstReject.textContent).not.toBe(finalReject.textContent);
  });

  it("无记录 → 空态「暂无审核记录」", () => {
    render(<AuditTimeline records={[]} />);

    expect(screen.getByText("暂无审核记录")).toBeInTheDocument();
  });
});
