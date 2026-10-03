import { expect, test, type Page } from "@playwright/test";

/**
 * 4 角色越权拒绝（docs/16 §2.3）—— **本地专用**
 * ============================================================================
 * · **真跑**：用例 6「未登录访问 /admin/articles → 302 /admin/login?callbackUrl=…」（T1.9 起）
 * · **T4.1b 起真跑**：用例 1 / 2 / 3 / 5 —— 只断言**界面层**（按 D-2 裁决，见 `docs/16` §2.3 脚注）：
 *     原文「403 / 界面无发布按钮 + **直接调接口被拒**」的后半句在本架构下不可 E2E
 *     （权威校验在 Server Action，无对应 REST 端点）；它由 `tests/unit/permissions.test.ts`
 *     的 L2 矩阵覆盖。本文件负责"界面无入口"这一半。
 * · **仍 `.skip`**：用例 4（`site_admin` 跨站）—— 属 M4 后段，需要第二站点的固定数据
 *
 * ⚠ 前置：`pnpm db:reset && pnpm db:seed`；账号切换用 `login()`（先清 cookie）。
 */

const PASSWORD = "admin123";

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

/** 以指定账号新建草稿 → 返回编辑页 URL（同 `audit-workflow.spec.ts` 的 helper） */
async function createDraft(page: Page, username: string, title: string): Promise<string> {
  await login(page, username);
  await page.goto("/admin/articles/new");
  await page.selectOption('select[name="channelId"]', { index: 1 });
  await page.fill('input[name="title"]', title);

  await page.locator(".ProseMirror").click();
  await page.keyboard.type(`${title}：越权测试正文。`);

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/articles$/);

  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/articles\/[^/]+\/edit$/);

  return page.url();
}

async function expectStatus(page: Page, label: string): Promise<void> {
  await expect(page.locator('[data-slot="article-status"]')).toHaveText(label);
}

async function clickWorkflow(page: Page, name: string): Promise<void> {
  const before = await page.locator('[data-slot="audit-item"]').count();
  await page.getByRole("button", { name }).click();
  await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(before + 1);
}

test.describe("拦截层（proxy.ts）：未登录保护", () => {
  test("用例 6：未登录访问 /admin/articles → 302 到 /admin/login 并带 callbackUrl", async ({
    page,
  }) => {
    await page.goto("/admin/articles");

    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page).toHaveURL(/callbackUrl=%2Fadmin%2Farticles/);
  });

  test("未登录访问 /admin/dashboard → 同样被拦截（/admin/login 自身放行）", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login/);

    // 登录页本身必须可访问，否则死循环
    const response = await page.goto("/admin/login");
    expect(response?.status()).toBe(200);
  });
});

test.describe("4 角色越权（T4.1b 解除部分 skip：界面无入口）", () => {
  test("用例 1：editor 在「待终审」稿件上看不到「发布」按钮", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "越权1 editor 无发布");

    // 推到 pending_final（此时"发布"对 auditor 可见）
    await clickWorkflow(page, "提交初审");
    await login(page, "auditor");
    await page.goto(editUrl);
    await expect(page.getByRole("button", { name: "发布" })).toBeVisible();
    await clickWorkflow(page, "初审通过");
    await expectStatus(page, "待终审");

    // 换回 editor：能看页面，但没有 article.publish ⇒ 界面无「发布」「退回」
    await login(page, "editor");
    await page.goto(editUrl);
    await expectStatus(page, "待终审");
    await expect(page.getByRole("button", { name: "发布" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "退回" })).toHaveCount(0);
  });

  test("用例 2：editor 打开他人稿件 → 404（约束 C4）", async ({ page }) => {
    // 用 site_admin 建稿：与 editor **同站**但归属人不同 ⇒ 命中的是 C4（而非跨站）
    const othersUrl = await createDraft(page, "site_admin", "越权2 site_admin 的稿件");

    await login(page, "editor");
    const response = await page.goto(othersUrl);

    expect(response?.status()).toBe(404);
    await expect(page.locator('[data-slot="article-status"]')).toHaveCount(0);
  });

  test("用例 3：auditor 界面无文章管理入口（菜单按 menu.* 过滤）", async ({ page }) => {
    await login(page, "auditor");
    await page.goto("/admin/dashboard");

    // auditor 的菜单 = menu.dashboard / menu.audits / menu.comments
    await expect(page.locator('a[href="/admin/audits"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/articles"]')).toHaveCount(0);
  });

  test("用例 5：editor 在「已发布」稿件上看不到「撤稿」按钮", async ({ page }) => {
    const editUrl = await createDraft(page, "editor", "越权5 editor 无撤稿");

    await clickWorkflow(page, "提交初审");
    await login(page, "auditor");
    await page.goto(editUrl);
    await clickWorkflow(page, "初审通过");
    await clickWorkflow(page, "发布");
    await expectStatus(page, "已发布");

    // 换回 editor：稿件仍是**本人**的（C4 通过），但撤稿是内容把关动作 ⇒ 界面无「撤稿」
    await login(page, "editor");
    await page.goto(editUrl);
    await expectStatus(page, "已发布");
    await expect(page.getByRole("button", { name: "撤稿" })).toHaveCount(0);
  });

  test.skip("用例 4：site_admin 访问其它站点内容 → 403（L3 数据范围）", async () => {
    // TODO（M4 后段）：需要第二站点的固定数据 + `site_admin` 的跨站 URL 直达断言
  });
});
