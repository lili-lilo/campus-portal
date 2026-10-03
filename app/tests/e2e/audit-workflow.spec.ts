import { expect, test, type Page } from "@playwright/test";

/**
 * 审核流 8 条边（docs/16 §2.2 / docs/13 §7.2）—— **T4.1b 起真跑**
 * ============================================================================
 * · 单元层已由 `tests/unit/state-machine.test.ts` 全覆盖（8 条边 + 非法转移 + C2）；
 *   本 spec 覆盖 E2E 侧被选中的边 **1/2/3/6/7**（docs/16 §2.2 L106）
 * · 账号切换：每个 test 内自己登录（同 `demo-flow.spec.ts` 口径）；`login()` **先清 cookie**
 * · 每篇稿件由 **editor 现场新建**：保证 C4 的"本人稿件"成立（否则边 1/7 会被 FORBIDDEN 挡）
 * · 断言锚点：`[data-slot="article-status"]`（编辑页徽标）、`[data-slot="audit-item"]`（C1 计数）
 *
 * ⚠ 前置：`pnpm db:reset && pnpm db:seed`（同 `playwright.config.ts` 注释）；slug 由表单自动派生
 *   （`article-{yyyyMMddHHmmss}`，秒级），用例串行执行故不会撞 `@@unique([siteId, slug])`。
 */

const PASSWORD = "admin123";

test.beforeEach(({ page }) => {
  // confirm 弹窗（「退回」「撤稿」有二次确认）一律接受；有监听器时 Playwright 不再自动 dismiss
  page.on("dialog", (dialog) => void dialog.accept());
});

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

/**
 * 以指定账号新建一篇草稿，返回**编辑页绝对 URL**。
 * 列表默认按 `updatedAt` 倒序 ⇒ 第一行的标题链接就是刚建的这篇（T3.3 补漏的编辑入口）。
 */
async function createDraft(page: Page, username: string, title: string): Promise<string> {
  await login(page, username);
  await page.goto("/admin/articles/new");
  await page.selectOption('select[name="channelId"]', { index: 1 });
  await page.fill('input[name="title"]', title);

  // 正文是 Tiptap 非受控编辑器（T3.4）⇒ 用真实键盘输入，别用 fill
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(`${title}：端到端测试正文。`);

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/articles$/);

  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/articles\/[^/]+\/edit$/);

  return page.url();
}

/** 点一个流转按钮，并断言 **C1**：`audit-item` 恰好 +1 */
async function clickAction(page: Page, name: string): Promise<void> {
  const before = await page.locator('[data-slot="audit-item"]').count();

  await page.getByRole("button", { name }).click();

  await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(before + 1);
}

async function expectStatus(page: Page, label: string): Promise<void> {
  await expect(page.locator('[data-slot="article-status"]')).toHaveText(label);
}

test.describe("审核流 8 条边（T4.1b 解除 skip）", () => {
  test("边 1：draft → pending_first（editor 提交初审）", async ({ page }) => {
    await createDraft(page, "editor", "边1 提交初审");

    await expectStatus(page, "草稿");
    await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(0);

    await clickAction(page, "提交初审");

    await expectStatus(page, "待初审");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("草稿 → 待初审");
  });

  test("边 2：pending_first → pending_final（auditor 初审通过）", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "边2 初审通过");
    await clickAction(page, "提交初审"); // 准备态（边 1）

    await login(page, "auditor");
    await page.goto(editUrl);

    await clickAction(page, "初审通过");

    await expectStatus(page, "待终审");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("待初审 → 待终审");
  });

  test("边 3：pending_final → published（终审发布）", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "边3 终审发布");

    await clickAction(page, "提交初审");
    await login(page, "auditor");
    await page.goto(editUrl);
    await clickAction(page, "初审通过");

    await clickAction(page, "发布");

    await expectStatus(page, "已发布");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("待终审 → 已发布");
  });

  test("边 6：published → withdrawn（撤稿）", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "边6 撤稿");

    await clickAction(page, "提交初审");
    await login(page, "auditor");
    await page.goto(editUrl);
    await clickAction(page, "初审通过");
    await clickAction(page, "发布");

    await clickAction(page, "撤稿");

    await expectStatus(page, "已撤稿");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("已发布 → 已撤稿");
  });

  test("边 7：withdrawn → pending_first（原样重提）", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "边7 原样重提");

    await clickAction(page, "提交初审");
    await login(page, "auditor");
    await page.goto(editUrl);
    await clickAction(page, "初审通过");
    await clickAction(page, "发布");
    await clickAction(page, "撤稿");

    await login(page, "editor");
    await page.goto(editUrl);

    await clickAction(page, "重新提交初审");

    await expectStatus(page, "待初审");
    // 边 7 的 fromStatus 必须是「已撤稿」（而不是「草稿」）
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("已撤稿 → 待初审");
  });

  test("约束 C1：完整链 5 条边 → AuditRecord 恰好 5 条（计数逐次 +1）", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "C1 计数链");
    await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(0);

    await clickAction(page, "提交初审"); // 边 1 → 1 条

    await login(page, "auditor");
    await page.goto(editUrl);
    await clickAction(page, "初审通过"); // 边 2 → 2 条
    await clickAction(page, "发布"); // 边 3 → 3 条
    await clickAction(page, "撤稿"); // 边 6 → 4 条

    await login(page, "editor");
    await page.goto(editUrl);
    await clickAction(page, "重新提交初审"); // 边 7 → 5 条

    await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(5);
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("提交");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("审核");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("发布");
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("撤稿");
  });
});
