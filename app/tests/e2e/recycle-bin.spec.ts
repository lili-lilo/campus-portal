import { test } from "@playwright/test";

/**
 * 回收站可恢复（docs/16 §2.4）—— **骨架（`.skip`）**
 *
 * 4 步：删除 → 回收站可见 → 恢复（状态不重置）→ 彻底删除（附件级联）
 * 另需断言：对回收站中的文章执行编辑 → `SOFT_DELETED`
 *
 * 交付时机：第 4 周（软删除 + 回收站就绪后）
 */

test.describe.skip("回收站（待第 4 周软删除就绪）", () => {
  test("第 1 步：删除 published 文章 → deletedAt 非空、前台查不到、记录仍在", async () => {
    // TODO
  });

  test("第 2 步：回收站列表出现该文章", async () => {
    // TODO
  });

  test("第 3 步：恢复 → deletedAt 置空且**状态仍为 published**", async () => {
    // TODO
  });

  test("第 4 步：彻底删除 → 记录消失、Attachment 级联", async () => {
    // TODO
  });

  test("对回收站中的文章执行编辑 → SOFT_DELETED", async () => {
    // TODO（docs/14 §2.2 错误码）
  });
});
