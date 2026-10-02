import { describe, it } from "vitest";

/**
 * `AuditTimeline` 组件测试 —— **骨架（`.skip`）**
 *
 * · 交付时机：第 4 周（审核流打通时）
 * · 断言要求（docs/16 §2.6）：能按 `fromStatus → toStatus` 渲染流转文案，
 *   且 `reject` 需区分**初审退回**与**终审退回**（`step` 相同、`fromStatus` 不同）
 */
describe.skip("AuditTimeline（待第 4 周审核流交付）", () => {
  it("按 fromStatus → toStatus 渲染流转文案，reject 区分初审/终审", () => {
    // TODO(第 4 周)：喂入两条 AuditRecord（pending_first→rejected / pending_final→rejected）
    //   断言文案可区分
  });
});
