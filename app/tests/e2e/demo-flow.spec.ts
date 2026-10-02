import { expect, test } from "@playwright/test";

/**
 * 演示链路 9 步（docs/16 §2.1）—— **本地专用**，不进 CI
 *
 * T1.9 范围（裁决 Q4 变体）：
 *   · **真跑**：后台登录（T1.8 已就绪）—— 4 个演示账号各一次 + 错密码一次
 *   · **`.skip`**：9 步演示链路本身，其余步骤依赖第 2~4 周功能
 *     （第 1/4/5 步的功能其实已就绪，可在本机 E2E 时逐个解除 skip）
 *
 * 前置：`pnpm db:reset && pnpm db:seed`（docs/16 §1.3）
 */

test.describe("后台登录（T1.8 已就绪，真跑）", () => {
  for (const username of ["admin", "site_admin", "editor", "auditor"]) {
    test(`${username} / admin123 可登录并进入 /admin/dashboard`, async ({ page }) => {
      await page.goto("/admin/login");
      await page.fill('input[name="username"]', username);
      await page.fill('input[name="password"]', "admin123");
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/\/admin\/dashboard/);
    });
  }

  test("错密码 → 停在 /admin/login?error=invalid_credentials 且提示通用文案", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill('input[name="username"]', "admin");
    await page.fill('input[name="password"]', "definitely-wrong-password");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/error=invalid_credentials/);
    await expect(page.getByRole("alert")).toContainText("用户名或密码不正确");
  });
});

test.describe.skip("演示链路 9 步（待第 2~4 周功能就绪）", () => {
  test("第 1 步：首页轮播 / 要闻 / 公告", async () => {
    // TODO：/main 返回 200；轮播 ≥1 张图；要闻列表非空；公告标签可切换
  });

  test("第 2 步：新闻详情含富文本与附件", async () => {
    // TODO（第 2 周）：详情页含富文本节点；附件 ≥1 且 href 指向 /api/files/[id]/download
  });

  test("第 3 步：搜索「招生」并高亮", async () => {
    // TODO（第 2 周）：结果数 > 0；命中片段含 <mark>
  });

  test("第 4 步：切换英文（URL 变 /en/...）", async () => {
    // TODO：断言 URL 前缀与导航文案（无需截图）
  });

  test("第 5 步：无障碍字体缩放 / 高对比度（属性断言，降级项）", async () => {
    // TODO：断言 <html> 的 data-a11y-font / data-a11y-contrast 变化且刷新后保持（docs/16 §2.1 第 5 步）
  });

  test("第 7 步：新建 → 提交 → 初审 → 终审发布（8 条边）", async () => {
    // TODO（第 3~4 周）：状态依次 draft → pending_first → pending_final → published；每次流转 AuditRecord +1
  });

  test("第 8 步：回前台看到新文章（revalidatePath 生效）", async () => {
    // TODO（第 4 周）：A25 要求发布后前台立即可见
  });

  test("第 9 步：切换子站看独立首页（U7 简化模板）", async () => {
    // TODO（第 2 周）：/cs 返回 200；不含全站轮播；标题含"计算机学院"
  });
});
