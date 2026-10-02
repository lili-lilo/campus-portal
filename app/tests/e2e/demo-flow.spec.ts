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
 *
 * ⚠ **T2.8 Part 2 选择器三坑**（首轮 3 个失败全部源于此，已修）：
 *   1. `getByRole("alert")` 会同时命中 Next.js 的路由播报器
 *      `<div role="alert" id="__next-route-announcer__">` → 改用 `p[role="alert"]`
 *   2. `[aria-roledescription="carousel"]` 会同时命中 HeroCarousel 的 `<section>` 与
 *      shadcn carousel 内层 `<div role="region">` → 限定 `section[aria-roledescription="carousel"]`
 *   3. 首页要闻区块里 DOM 最靠前的 `<a>` 是标题右侧的**「更多」**链接（不是文章卡片）
 *      → 卡片用 `ul li a` 定位，并对"卡片自身 href"做断言
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
    // ⚠ 不能用 `getByRole("alert")`：Next.js 自带路由播报器
    //   `<div role="alert" id="__next-route-announcer__">` 会命中第 2 个元素（strict mode violation）
    //   → 限定为登录表单里的 `<p role="alert">`
    await expect(page.locator('p[role="alert"]')).toContainText("用户名或密码不正确");
  });
});

test.describe("演示链路 · 第 1/2/3/9 步（T2.8 Part 1 解除 skip）", () => {
  test("第 1 步：首页有轮播卡片", async ({ page }) => {
    await page.goto("/main");

    // ⚠ 必须限定到 `<section>`：shadcn 的 carousel 内层还有
    //   `<div data-slot="carousel" role="region" aria-roledescription="carousel">`，
    //   裸属性选择器会命中 2 个元素（strict mode violation）
    const carousel = page.locator('section[aria-roledescription="carousel"]');
    await expect(carousel).toBeVisible();

    // ≥1 张卡片（每张卡片是一个指向文章/栏目的链接）
    expect(await carousel.locator("a").count()).toBeGreaterThan(0);

    // 要闻区非空：只数**文章卡片**的链接（`ul li a`），排除区块标题右侧的「更多」链接
    expect(
      await page.locator('section[aria-labelledby="home-news-title"] ul li a').count(),
    ).toBeGreaterThan(0);
  });

  test("第 2 步：点新闻进详情页并能看到标题", async ({ page }) => {
    await page.goto("/main");

    // ⚠ 只点**文章卡片**的链接：该 section 里 DOM 顺序最靠前的 `<a>` 是区块标题右侧的
    //   「更多 →」（`ui/section-title.tsx`，moreHref=/{site}/news）—— 点它会停在列表页
    //   （T2.8 Part 2 失败 3 的根因）。卡片在 `ul li` 内（`ArticleCard` 的 `<Link>`）。
    const card = page.locator('section[aria-labelledby="home-news-title"] ul li a').first();
    const href = (await card.getAttribute("href")) ?? "";

    // 防假通过：href 为空时下面的 `$` 正则能匹配任意 URL
    expect(href).not.toBe("");

    await card.click();

    // 断言"应用自己给出的 href"确实能落到详情页：链接规则为 `/{site}/{channel}/{slug}`
    // （`articleHref`，T2.2）。⚠ 该区块是**全站要闻**，首条可能是 notice 等其他栏目，
    // 故不能写死 `/main/news/`。
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveURL(new RegExp(`${escaped}$`));

    // 诊断（T2.8 Part 2 失败分析）：失败时把 `<article>` 数量与页面**全部** `<h1>` 文本打出来
    //   · h1 有内容但无 article ⇒ 落到了 404/错误页（`not-found.tsx` 自带 h1，见 docs/00 §8 记录）
    //   · h1 集合为空        ⇒ 页面尚未渲染出来（超时 / 流式未完成）
    const articleCount = await page.locator("article").count();
    const headings = await page.locator("h1").allTextContents();
    expect(
      articleCount,
      `详情页应含 <article>；实际 article=${articleCount}，h1=${JSON.stringify(headings)}，URL=${page.url()}`,
    ).toBeGreaterThan(0);

    // 冷路由：dev 服务器对该详情路由是**首次请求按需编译**（URL 由客户端导航乐观更新，
    // 正文仍在流式渲染）⇒ 默认 5s 断言超时不够，此处放宽到 15s
    await expect(page.locator("article h1")).toBeVisible({ timeout: 15_000 });
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

    // U7 简化模板：子站**没有**全站轮播（同样限定 `<section>`，避免命中 shadcn 内层 div）
    await expect(page.locator('section[aria-roledescription="carousel"]')).toHaveCount(0);
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
