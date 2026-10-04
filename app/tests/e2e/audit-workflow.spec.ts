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
 * ⚠ 前置：`$env:ALLOW_DB_RESET="1"; pnpm db:reset; pnpm db:seed`（同 `playwright.config.ts` 注释）；slug 由表单自动派生
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
  // 再断言"已登录的后台外壳"确实渲染（登录页没有侧边栏 nav）⇒ 证明 cookie 已生效，
  // 否则后续 `page.goto` 会被 proxy 302 回登录页、`response.status()` 变成 200（伪装成"gate 未生效"）
  await expect(page.locator('nav[aria-label="后台导航"]')).toBeVisible();
}

/**
 * 以指定账号新建一篇草稿，返回**编辑页绝对 URL**。
 * 列表默认按 `updatedAt` 倒序 ⇒ 第一行的标题链接就是刚建的这篇（T3.3 补漏的编辑入口）。
 */
async function createDraft(page: Page, username: string, title: string): Promise<string> {
  await login(page, username);
  await page.goto("/admin/articles/new");

  // ① **hydration 屏障**：先用 Tiptap（客户端组件）打字并断言通过，证明 React 已 hydration。
  //    ⚠ 在它之前做的 `selectOption` / `fill` 可能落在"尚未 hydration"的 DOM 上 —— 原生
  //    `change` 事件此时没有 React 监听 ⇒ DOM 有值、**RHF state 仍为空** ⇒ zod 只报
  //    「请选择栏目」（T4.1c 复盘：真因不是"没选栏目"，而是选得太早）。
  //    另：正文必须用 `pressSequentially`（逐字符真实键入）；`keyboard.type()` 走 CDP
  //    `insertText` 注入，Tiptap 3.x 下不进 ProseMirror 事务 ⇒ `content` 为空串。
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially(`${title}：端到端测试正文。`);
  await expect(editor).toContainText("端到端测试正文");

  // ② hydration 之后再填标题与栏目（此时事件必被 React 收到），并断言栏目**真的**被选中
  await page.fill('input[name="title"]', title);

  const channelSelect = page.locator('select[name="channelId"]');
  await channelSelect.selectOption({ index: 1 }); // index 0 = 「请选择栏目」(value="")
  await expect(channelSelect).not.toHaveValue("");

  await page.getByRole("button", { name: "保存草稿" }).click();

  // 失败自解释：被客户端校验 / 服务端拒绝时，把真实原因打出来，别只留一个 URL 超时
  const blocked = page.locator('p[role="alert"], p[data-slot="form-message"]');
  if (
    await blocked
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    console.log("保存被拦：", await blocked.allInnerTexts(), "url =", page.url());
  }

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

  test("约束 C3：编辑已发布文章前落 ArticleVersion 快照（并回落 draft，边 8）", async ({
    page,
  }) => {
    const editUrl = await createDraft(page, "editor", "C3 快照测试");

    // 推到「已发布」：editor 提交初审 → auditor 初审通过 → auditor 发布
    await clickAction(page, "提交初审");
    await login(page, "auditor");
    await page.goto(editUrl);
    await clickAction(page, "初审通过");
    await clickAction(page, "发布");
    await expectStatus(page, "已发布");

    // editor 回到编辑页：此刻**还没有**任何版本快照（新建 + 链上发布都不落快照）
    await login(page, "editor");
    await page.goto(editUrl);
    await expect(page.locator('[data-slot="version-item"]')).toHaveCount(0);

    // ⚠ 故意改标题：这样"快照存的是**编辑前**内容"才可验证（标题不变则新旧同值，断言无意义）
    await page.fill('input[name="title"]', "C3 快照测试（已改）");
    await page.getByRole("button", { name: "保存草稿" }).click();

    // 保存成功会跳回列表（T3.5 口径）⇒ **必须重新进入编辑页**再断言
    await expect(page).toHaveURL(/\/admin\/articles$/);
    await page.goto(editUrl);

    // C3：恰好 1 条快照，且标题是**旧值**（不含"（已改）"）
    await expect(page.locator('[data-slot="version-item"]')).toHaveCount(1);
    await expect(page.locator('[data-slot="version-item"]')).toContainText("C3 快照测试");
    await expect(page.locator('[data-slot="version-item"]')).not.toContainText("（已改）");

    // 边 8：状态回落「草稿」；文章本身已是新标题
    await expectStatus(page, "草稿");
    await expect(page.locator('input[name="title"]')).toHaveValue("C3 快照测试（已改）");

    // C1：审计时间线 4 条（提交 / 初审 / 发布 / 保存草稿），且含「已发布 → 草稿」
    await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(4);
    await expect(page.locator('[data-slot="audit-timeline"]')).toContainText("已发布 → 草稿");
  });
});
