import { test } from "@playwright/test";

/**
 * 审核流 8 条边（docs/16 §2.2 / docs/13 §7.2）—— **骨架（`.skip`）**
 *
 * 单元层已由 `tests/unit/state-machine.test.ts` 全覆盖（8 条边 + 非法转移 + C2）；
 * 本 spec 只覆盖 E2E 侧被选中的边 1/2/3/6/7（docs/16 §2.2 的 E2E 列）。
 *
 * 交付时机：第 3~4 周（后台新建/编辑 + Server Action 就绪后）
 */

test.describe.skip("审核流 8 条边（待第 3~4 周后台功能就绪）", () => {
  test("边 1：draft → pending_first（editor 提交初审）", async () => {
    // TODO：登录 editor → 新建文章 → 提交审核 → 断言状态与 AuditRecord.step=submit
  });

  test("边 2：pending_first → pending_final（auditor 初审通过）", async () => {
    // TODO：登录 auditor → 审核通过 → 断言 step=review
  });

  test("边 3：pending_final → published（终审发布）", async () => {
    // TODO：断言 step=publish
  });

  test("边 6：published → withdrawn（撤稿）", async () => {
    // TODO：断言 step=withdraw
  });

  test("边 7：withdrawn → pending_first（原样重提）", async () => {
    // TODO：断言 step=submit，且 fromStatus=withdrawn
  });

  test("每条边都新增 1 条 AuditRecord（约束 C1）", async () => {
    // TODO（第 4 周）：流转前后计数 +1，且 fromStatus/toStatus 精确
  });
});
