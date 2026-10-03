import { expect, test } from "@playwright/test";

/**
 * 演示链路 9 步（docs/16 §2.1）—— **本地专用**，不进 CI
 *
 * T1.9 范围（裁决 Q4 变体）：后台登录（T1.8 已就绪）**真跑**。
 * T2.8 Part 1：**解除第 1/2/3/9 步的 `.skip`** —— 第 1/2 步依赖 T2.2+ 首页与 T2.5 详情页，
 *   第 3 步依赖 T2.7 搜索，第 9 步依赖 T2.3 子站模板。
 * **M5-2b**：**第 4 步（英文切换）解除 `.skip`**（M5-1/M5-1b 的 `nameEn` 系列已就绪）；
 *   **第 5 步（无障碍）在 `tests/e2e/a11y.spec.ts` 真跑**（5 条），本文件只留骨架占位；
 *   **第 7/8 步仍 `.skip`**（第 7 步已由 `audit-workflow.spec.ts` 覆盖，第 8 步待第 6 周）。
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

test.describe("演示链路 · 第 6 步 + M3·R5（T3.7 补）", () => {
  /**
   * 第 6 步断言（docs/16 §2.1 L97 原文：「登录成功跳 `/admin/dashboard`；**统计卡片与图表容器渲染**」）
   *
   * 前一 describe 已覆盖"跳转"这一半（L31）；此处补"卡片与图表容器渲染"。
   * 选择器口径（规避 docs/00 §8 #60 的宽选择器三坑）：一律用稳定的 `data-slot` 锚点 ——
   *   · 统计卡片标签 = `CardDescription` 文本（`admin/stat-card.tsx` L18）→ `getByText(label, { exact: true })`
   *     ⚠ **不要**用 `[data-slot="card"]` 计数：仪表盘上 Card 共 **8** 个（4 张统计卡 + 4 张图表卡）
   *   · 真图容器 = `ui/chart.tsx` L62 的 `data-slot="chart"`（**4 个**：趋势 / 来源分布 / 文章排行 / 栏目排行）
   *   · M5-3a 起**不再有**占位卡：`admin/chart-placeholder.tsx` 已删除（原「数据待 M5 接入」文案随之消失）
   */
  test("第 6 步：仪表盘渲染 4 张统计卡片 + 4 个真图", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill('input[name="username"]', "admin");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    // ① 4 张统计卡片（`{ exact: true }` 避免与卡片内 hint 文本冲突）
    for (const label of ["站点数", "文章数", "用户数", "媒体数"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // ② 图表容器恰好 4 个（趋势 / 来源分布 / 文章排行 / 栏目排行）
    //    M5-3a：原为 1 真图 + 3 占位（`数据待 M5 接入`）；四图接真数据后占位断言删除
    const charts = page.locator('[data-slot="chart"]');
    await expect(charts).toHaveCount(4);

    // ③ **每个**容器内都渲染了 recharts 的 `<svg>`（即"四图都有数据"）
    for (let i = 0; i < 4; i += 1) {
      expect(await charts.nth(i).locator("svg").count()).toBeGreaterThan(0);
    }
  });

  /**
   * M3·R5 字段级提示（docs/16 §4.2 L299「表单校验（zod 4 + RHF）在错误输入下给出**字段级**提示」）
   *
   * 空表单直接提交 → 客户端 zod 先拦（`articleFormSchema`）→ `FormMessage` 渲染
   * `p[data-slot="form-message"]`（`ui/form.tsx` L140）；必填 4 项 = channelId / title / slug / content
   *（summary / cover 可选）。**不进 Server Action、不写库** ⇒ 这条用例最稳。
   *
   * ⚠ 提交按钮**不能**用裸 `button[type="submit"]`：后台布局的顶栏还有一个"退出登录"的 submit 按钮
   *   （`admin/admin-topbar.tsx`）⇒ 会 strict mode violation，故按可访问名定位。
   */
  test("M3·R5：空表单提交给出字段级提示且不跳转", async ({ page }) => {
    await page.goto("/admin/login");
    await page.fill('input[name="username"]', "admin");
    await page.fill('input[name="password"]', "admin123");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/admin\/dashboard/);

    await page.goto("/admin/articles/new");
    await page.getByRole("button", { name: "保存草稿" }).click();

    const messages = page.locator('p[data-slot="form-message"]');
    await expect(messages.first()).toBeVisible();
    expect(await messages.count()).toBeGreaterThanOrEqual(4);

    // 被客户端校验拦下 ⇒ 未发起 Server Action、URL 不变
    await expect(page).toHaveURL(/\/admin\/articles\/new$/);
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

test.describe("演示链路 · 第 4 步（M5-2b 解除 skip）", () => {
  test("第 4 步：切换英文（URL 变 /en/...，导航与站点名显示英文）", async ({ page }) => {
    await page.goto("/main");
    // 页头的语言切换链接：zh 站显示 "EN"，en 站显示 "中文"（site-header.tsx）
    await page.getByRole("link", { name: "EN", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/main$/);

    // M5-1 / M5-1b 系列：站点名（Site.nameEn）与导航栏（Navigation.nameEn）随 locale 切英文
    await expect(page.locator("header")).toContainText("XX University");
    await expect(page.locator("header")).toContainText("News");

    // 切回中文（URL 前缀去掉 ⇒ as-needed）
    await page.getByRole("link", { name: "中文", exact: true }).click();
    await expect(page).toHaveURL(/\/main$/);
    await expect(page.locator("header")).toContainText("XX大学");
  });
});

test.describe.skip("演示链路 · 第 5/7/8 步（第 5 步已移入 a11y.spec.ts；7/8 待 M6）", () => {
  test("第 5 步：无障碍字体缩放 / 高对比度（属性断言，降级项）", async () => {
    // 已由 `tests/e2e/a11y.spec.ts` 真跑覆盖（5 条：默认 / 5 档 / 对比度 / 刷新保持+SSR 首帧 / 无 script 警告）
    // 保留本骨架仅为与 docs/16 §2.1 的 9 步编号一一对应
  });

  test("第 7 步：新建 → 提交 → 初审 → 终审发布（8 条边）", async () => {
    // 已由 `audit-workflow.spec.ts` 真跑覆盖（边 1/2/3/6/7）；此处保持骨架
  });

  test("第 8 步：回前台看到新文章（revalidatePath 生效）", async () => {
    // TODO（第 6 周）：A25 要求发布后前台立即可见
  });
});
