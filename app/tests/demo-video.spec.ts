import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/**
 * 明德大学 · **2 分钟自动演示录屏**（M6）—— 本地手动跑，**不进 CI**
 * ============================================================================
 * 运行（**必须用显式路径**，见下"发现规则"）：
 *
 *   cd D:\workspace\app
 *   pnpm exec playwright test tests/demo-video.spec.ts --project=chromium
 *
 * ## 发现规则（为什么不进 CI / 不进 `pnpm test:e2e`）
 *   本文件在 `tests/` 根下，而 `playwright.config.ts` 的 `testDir` 是 **`tests/e2e`**
 *   ⇒ `pnpm test:e2e`（= `playwright test`）**不会收集它**；同时测试体内还有
 *   `test.skip(!!process.env.CI)` 双保险（docs/16 §5：E2E 不进 CI，录屏更不进）。
 *
 * ## 视频输出
 *   Playwright 先录到 `app/test-results/**`（`.gitignore` L15 已排除），本脚本在
 *   `test.afterEach` 里用 `video.saveAs()` 复制到 **`docs/演示视频/demo.webm`**
 *   （该目录在**根** `.gitignore` 里排除，故视频不会进仓库）。
 *   本机 **未检测到 ffmpeg**，如需 mp4（可选）：
 *     ffmpeg -y -i docs\演示视频\demo.webm -c:v libx264 -pix_fmt yuv420p -crf 23 docs\演示视频\demo.mp4
 *
 * ## 8 个分镜（等待合计 ~87s + 页面加载 ⇒ 成片 ≈ 2 分钟）
 *   1 Hero + 数字看板（~10s）｜2 新闻列表 → 详情（~15s）｜3 切英文（~8s）｜4 无障碍面板（~8s）
 *   5 搜索（~8s）｜6 子站 /cs（~8s）｜7 后台登录 → 仪表盘 → 内容管理 → 编辑页（~25s）｜8 回首页（~5s）
 *
 * ## 两个刻意的设计
 *   · **每步 try/catch**：任何一步失败都**不中断录屏**（失败落 `test-results/demo-step-N.png`），
 *     因为录屏是一次性产物，宁可少一个分镜也不要整段报废。
 *   · **选择器口径沿用 `tests/e2e/` 已实测的写法**，含 docs 里记过的三个坑：
 *       ① Hero 必须写 `section[aria-roledescription="carousel"]`（shadcn 内层还有同属性的 `<div>`）；
 *       ② 要闻卡片用 `ul li a`（区块里 DOM 最靠前的 `<a>` 是标题右侧的「更多」）；
 *       ③ 不要裸用 `getByRole("alert")`（Next 的路由播报器也带 `role="alert"`）。
 *   · 鼠标指针**不会**出现在录像里（Playwright 视频无指针层，属已知限制）。
 */

/** 成片落点：`<repo>/docs/演示视频/demo.webm`（cwd = app/ ⇒ 上跳一级） */
const DEMO_DIR = join(process.cwd(), "..", "docs", "演示视频");
const DEMO_VIDEO = join(DEMO_DIR, "demo.webm");

/** 单步失败不中断：记录 + 落截图 */
async function step(
  page: Page,
  index: number,
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    console.log(`[demo] ✔ 分镜 ${index} ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[demo] ✘ 分镜 ${index} ${name} 失败：${message.split("\n")[0]}`);
    await page
      .screenshot({ path: join("test-results", `demo-step-${index}.png`) })
      .catch(() => undefined);
  }
}

/**
 * ⚠ `test.use({ video })` **必须在文件顶层**：Playwright 1.63 明确禁止在 `describe` 内声明
 * `video`（它会强制新开 worker）。写成 describe 级会直接报：
 *   "Cannot use({ video }) in a describe group, because it forces a new worker."（已实测）
 * 同理 `launchOptions` / `viewport` 一并放顶层，保持"一次测试 = 一段完整视频"。
 */
test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: "on", size: { width: 1440, height: 900 } },
  launchOptions: { args: ["--start-maximized"] },
});

test.describe("明德大学 · 2 分钟自动演示", () => {
  // 录屏 + 8 个分镜的等待合计 ~100s ⇒ 必须放宽单测超时（默认 30s 会直接掐断）
  test.setTimeout(240_000);

  test.afterEach(async ({ page }) => {
    const video = page.video();
    if (!video) {
      return;
    }
    mkdirSync(dirname(DEMO_VIDEO), { recursive: true });
    await video.saveAs(DEMO_VIDEO);
    const kb = Math.round(statSync(DEMO_VIDEO).size / 1024);
    console.log(`[demo] 成片已保存：${DEMO_VIDEO}（${kb} KB）`);
  });

  test("完整演示（8 分镜）", async ({ page }) => {
    test.skip(!!process.env.CI, "演示录屏：不进 CI（docs/16 §5）");
    page.setDefaultTimeout(15_000);

    // 冷路由首次按需编译较慢 ⇒ 首次导航放宽
    const go = (url: string) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // ── 分镜 1：主站 Hero + 数字看板（~10s）──────────────────────────────
    await step(page, 1, "主站 Hero + 数字看板", async () => {
      await go("/main");
      await page.waitForTimeout(2000);

      const hero = page.locator('section[aria-roledescription="carousel"]');
      await expect(hero).toBeVisible({ timeout: 30_000 });

      // 鼠标缓慢滑过 Hero（观感用）+ 轻微滚动
      const box = await hero.boundingBox();
      if (box) {
        const y = box.y + box.height * 0.6;
        for (let i = 0; i <= 8; i += 1) {
          await page.mouse.move(box.x + 200 + i * 120, y, { steps: 3 });
          await page.waitForTimeout(80);
        }
      }
      await page.waitForTimeout(1200);

      // 滚到数字看板（Hero 72vh ⇒ 一屏多一点）
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(3000);
    });

    // ── 分镜 2：新闻列表 → 详情（~15s）──────────────────────────────────
    await step(page, 2, "新闻列表 → 详情", async () => {
      const navLink = page
        .locator('nav[aria-label="主导航"]')
        .getByRole("link", { name: "新闻中心" });
      if (await navLink.count()) {
        await navLink.first().click();
      }
      await page.waitForURL(/\/main\/news/, { timeout: 20_000 }).catch(() => go("/main/news")); // 下拉菜单等交互差异的兜底
      await page.waitForTimeout(2000);

      // 列表页第一篇文章（卡片在 ul li 内）
      const card = page.locator("ul li a").first();
      await card.click();
      await page.waitForTimeout(3000);

      const h1 = page.locator("article h1");
      await expect(h1).toBeVisible({ timeout: 20_000 });
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(1500);
    });

    // ── 分镜 3：切英文（~8s）────────────────────────────────────────────
    await step(page, 3, "切英文", async () => {
      await page.getByRole("link", { name: "EN", exact: true }).first().click();
      await page.waitForTimeout(3000);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(3000);
    });

    // ── 分镜 4：无障碍面板（~8s）────────────────────────────────────────
    await step(page, 4, "无障碍面板（字号 150%）", async () => {
      await go("/main");
      const backToZh = page.getByRole("link", { name: "中文", exact: true });
      if (await backToZh.count()) {
        await backToZh.first().click();
        await page.waitForTimeout(1500);
      }

      // 入口在页脚（原生 <details> 折叠，零 JS）
      const summary = page.locator("footer summary").first();
      await summary.scrollIntoViewIfNeeded();
      await summary.click();
      await page.waitForTimeout(2000);

      await page.getByRole("button", { name: "150%", exact: true }).click();
      await page.waitForTimeout(2000);

      await summary.click(); // 关掉面板
      await page.waitForTimeout(2000);
    });

    // ── 分镜 5：搜索（~8s）─────────────────────────────────────────────
    await step(page, 5, "全站搜索「明德」", async () => {
      await page.locator('a[href$="/search"]').first().click();
      await page.waitForURL(/\/search/, { timeout: 20_000 });
      await page.waitForTimeout(1500);

      const input = page.locator('input[name="q"]');
      await input.click();
      await input.type("明德", { delay: 150 }); // 逐字输入，更像真人
      await page.waitForTimeout(1000);
      await input.press("Enter");
      await page.waitForTimeout(3000);
    });

    // ── 分镜 6：子站（~8s）─────────────────────────────────────────────
    await step(page, 6, "子站首页 /cs", async () => {
      await go("/cs");
      await page.waitForTimeout(3000);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(3000);
    });

    // ── 分镜 7：后台（~25s）────────────────────────────────────────────
    await step(page, 7, "后台登录 → 仪表盘 → 编辑页", async () => {
      await go("/admin/login");
      await page.fill('input[name="username"]', "admin");
      await page.fill('input[name="password"]', "admin123");
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/admin\/dashboard/, { timeout: 30_000 });
      await page.waitForTimeout(3000);

      // 仪表盘：4 张统计卡 + 4 个图表容器（滚动让图表入画）
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(3000);

      // 侧边栏「内容管理」
      const contentNav = page.getByRole("link", { name: /内容管理/ }).first();
      if (await contentNav.count()) {
        await contentNav.click();
      } else {
        await page.getByRole("link", { name: /文章/ }).first().click();
      }
      await page.waitForURL(/\/admin\/articles/, { timeout: 30_000 });
      await page.waitForTimeout(3000);

      // 第一篇文章的编辑入口（先找 /edit 链接，再退回「编辑」按钮）
      const editLink = page.locator('a[href*="/admin/articles/"][href$="/edit"]').first();
      if (await editLink.count()) {
        await editLink.click();
      } else {
        await page.getByRole("button", { name: /编辑/ }).first().click();
      }
      await page.waitForURL(/\/edit$/, { timeout: 30_000 });
      await page.waitForTimeout(3000);

      // 版本历史（已发布文章才有快照；平时是空态，滚到即止）
      await page
        .getByText("版本历史")
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => undefined);
      await page.waitForTimeout(3000);
    });

    // ── 分镜 8：回首页（~5s）───────────────────────────────────────────
    await step(page, 8, "回到主站首页", async () => {
      await go("/main");
      await page.waitForTimeout(3000);
    });
  });
});
