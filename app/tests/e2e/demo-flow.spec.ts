import { expect, test } from "@playwright/test";

/**
 * 演示链路 9 步（docs/16 §2.1）—— **本地专用**，不进 CI
 *
 * T1.9 范围（裁决 Q4 变体）：后台登录（T1.8 已就绪）**真跑**。
 * T2.8 Part 1：**解除第 1/2/3/9 步的 `.skip`** —— 第 1/2 步依赖 T2.2+ 首页与 T2.5 详情页，
 *   第 3 步依赖 T2.7 搜索，第 9 步依赖 T2.3 子站模板；**第 4/5/7/8 步仍 `.skip`**
 *   （第 4 步英文切换与第 5 步无障碍断言其实已可跑，本轮按用户指令保持 skip；
 *     第 7/8 步依赖 T3/T4 的后台发稿状态机与 revalidatePath）。
 *
 * 前置：`pnpm db:reset && pnpm db:seed`（docs/16 §1.3）+ **已安装 Playwright 浏览器**
 *   （`pnpm exec playwright install chromium`，约 150MB —— 见 docs/00 §8 #56，本沙箱不装）。
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

test.describe("演示链路 · 第 1/2/3/9 步（T2.8 Part 1 解除 skip）", () => {
  test("第 1 步：首页有轮播卡片", async ({ page }) => {
    await page.goto("/main");

    // T2.2 的 HeroCarousel 容器带 aria-roledescription="carousel"（aria-label 走 i18n home.heroLabel）
    const carousel = page.locator('[aria-roledescription="carousel"]');
    await expect(carousel).toBeVisible();

    // ≥1 张卡片（每张卡片是一个指向文章/栏目的链接）
    expect(await carousel.locator("a").count()).toBeGreaterThan(0);

    // 要闻区非空（T2.3 组装的 NewsList，section 由 aria-labelledby 定位）
    expect(
      await page.locator('section[aria-labelledby="home-news-title"] a').count(),
    ).toBeGreaterThan(0);
  });

  test("第 2 步：点新闻进详情页并能看到标题", async ({ page }) => {
    await page.goto("/main");

    const firstNews = page.locator('section[aria-labelledby="home-news-title"] a').first();
    await firstNews.click();

    // 进入 news/[id]（静态段优先于 [channel]/[id]，U2）并渲染出正文标题
    await expect(page).toHaveURL(/\/main\/news\/.+/);
    await expect(page.locator("article h1")).toBeVisible();
    await expect(page.locator("article h1")).not.toBeEmpty();
  });

  test("第 3 步：搜索「学校」有结果且高亮", async ({ page }) => {
    await page.goto("/main/search?q=%E5%AD%A6%E6%A0%A1"); // q=学校

    // 结果数 > 0（T2.8 后这句话来自 i18n search.found）
    await expect(page.getByText(/找到\s*\d+\s*篇/)).toBeVisible();

    // 命中片段含 <mark>（高亮由服务端拼接，见 search-highlight.tsx）
    expect(await page.locator("ul li mark").count()).toBeGreaterThan(0);
    await expect(page.locator("ul li h2 a").first()).toBeVisible();
  });

  test("第 9 步：切换子站看独立首页", async ({ page }) => {
    await page.goto("/cs");

    // 子站名（seed 里为"计算机学院"；用"学院"兜底，避免写死具体院名）
    await expect(page.locator("h1")).toContainText("学院");

    // U7 简化模板：子站**没有**全站轮播
    await expect(page.locator('[aria-roledescription="carousel"]')).toHaveCount(0);
  });
});

test.describe.skip("演示链路 · 第 4/5/7/8 步（待 T3/T4 功能就绪）", () => {
  test("第 4 步：切换英文（URL 变 /en/...）", async () => {
    // TODO：断言 URL 前缀与导航文案（无需截图）；**功能其实已就绪**，如需要可随时解除 skip
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
});
