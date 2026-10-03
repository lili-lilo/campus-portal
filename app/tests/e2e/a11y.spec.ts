import { expect, test, type Page } from "@playwright/test";

/**
 * 无障碍偏好（`docs/16` §2.1 第 5 步 · M5-2b）—— **本地专用**，断言口径见 §2.1 L96 / L102
 * ============================================================================
 * 口径：**只断言状态属性与持久化**（`T4` 裁决：不做视觉回归、不截图比对）。
 * 实现侧（M5-2a）：偏好存 **cookie**（`a11y-font-scale` / `a11y-contrast`），
 *   根 layout 用 `cookies()` 读 → **SSR 首帧即写对 `<html>` 的 `data-a11y-*`**。
 *
 * 5 条：
 *   1. 无 cookie 时默认 100 / off
 *   2. 字号 5 档循环（100 → 200）
 *   3. 高对比度开关 on ⇄ off
 *   4. **刷新保持** + **SSR 首帧证明**（`page.request.get` 取原始 HTML）
 *   5. dev 控制台**无** React 19 的 `Encountered a script tag` 警告（M5-2a 删脚本的回归）
 *
 * 选择器全部与语言无关：控件用 `aria-labelledby` 的固定 id（`a11y-font-label` /
 * `a11y-contrast-label`），字号按钮文案是 `100%`…`200%`（不翻译）。
 *
 * ⚠ 前置：`pnpm db:reset && pnpm db:seed`；且偏好写在 **cookie（context 级）** ⇒ 每条测试先清 cookie。
 */

const FONT_SCALES = ["100", "125", "150", "175", "200"] as const;

/** 打开页脚的无障碍入口（原生 `<details>` 折叠，零 JS） */
async function openA11yPanel(page: Page) {
  await page.goto("/main");
  const summary = page.locator("footer summary");
  await summary.click();
  await expect(page.locator('[aria-labelledby="a11y-font-label"] button').first()).toBeVisible();
}

async function expectAttrs(page: Page, font: string, contrast: string) {
  await expect(page.locator("html")).toHaveAttribute("data-a11y-font", font);
  await expect(page.locator("html")).toHaveAttribute("data-a11y-contrast", contrast);
}

test.beforeEach(async ({ page }) => {
  // 偏好是 context 级 cookie ⇒ 每条测试从"无偏好"的干净状态开始
  await page.context().clearCookies();
});

test.describe("无障碍偏好（M5-2b 真跑）", () => {
  test("默认：无 cookie 时 <html> 为 100 / off", async ({ page }) => {
    await page.goto("/main");
    await expectAttrs(page, "100", "off");
  });

  test("字号 5 档：逐档点击后 <html data-a11y-font> 同步变化", async ({ page }) => {
    await openA11yPanel(page);

    for (const scale of FONT_SCALES) {
      await page.getByRole("button", { name: `${scale}%`, exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("data-a11y-font", scale);
    }
  });

  test("高对比度：点一次 on，再点 off", async ({ page }) => {
    await openA11yPanel(page);
    const toggle = page.locator('[aria-labelledby="a11y-contrast-label"] button');

    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-a11y-contrast", "on");

    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-a11y-contrast", "off");
  });

  test("刷新保持 + SSR 首帧证明（cookie 由服务端读取）", async ({ page }) => {
    await openA11yPanel(page);

    await page.getByRole("button", { name: "150%", exact: true }).click();
    await page.locator('[aria-labelledby="a11y-contrast-label"] button').click();
    await expectAttrs(page, "150", "on");

    // ① 刷新后保持（docs/16 §2.1 第 5 步的 DoD 明写项）
    await page.reload();
    await expectAttrs(page, "150", "on");

    // ② **SSR 首帧证明**：直接请求原始 HTML，属性必须已在服务端渲染结果里
    //    （若只靠客户端 effect 事后修正，这里就会拿到 100 —— 也就说明仍有闪烁）
    const html = await (await page.request.get("/main")).text();
    expect(html).toContain('data-a11y-font="150"');
    expect(html).toContain('data-a11y-contrast="on"');
  });

  test("控制台无 React 19「script tag」警告（M5-2a 删内联脚本的回归）", async ({ page }) => {
    const messages: string[] = [];
    page.on("console", (message) => messages.push(message.text()));

    await page.goto("/main");
    await openA11yPanel(page);

    const offenders = messages.filter((text) => text.includes("script tag"));
    expect(offenders, `不应出现 script tag 警告，实际：${offenders.join(" | ")}`).toHaveLength(0);
  });
});
