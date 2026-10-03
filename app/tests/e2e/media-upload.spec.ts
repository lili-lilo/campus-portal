import { expect, test, type Page } from "@playwright/test";

/**
 * 媒体上传可用（`docs/16` §4.2 M4「媒体上传可用（`StorageAdapter` 抽象已抽出）」）
 * ============================================================================
 * 覆盖链路：**上传（`POST /api/media/upload` → `LocalStorageAdapter` 落盘 `public/uploads/`
 * → `prisma.media.create`）→ 列表出现（`listMedia`）→ 行内软删除（`deleteMedia`）**
 *
 * · 上传用 **site_admin**：它同时有 `media.upload` 与 `media.manage` ⇒ 一次登录覆盖"上传 + 删除"
 *   （`editor` 只有 `media.upload`，删除按钮对它不渲染 —— 该分支由 `page.tsx` 的 `canManage` 保证）
 * · 图片用**内存构造的 1×1 PNG**（硬编码 base64 → `Buffer`），**不读本地文件、不装任何工具**
 * · 删除是 `<form action={serverAction}>`：**没有 `window.confirm`**（媒体软删可恢复，属日常管理）
 * · 落盘位置：`app/public/uploads/other/<yyyyMM>/<uuid>-<文件名>`（该目录已 gitignore）
 *
 * ⚠ 前置：`pnpm db:reset && pnpm db:seed`
 */

const PASSWORD = "admin123";

/** 1×1 透明 PNG */
const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.locator('nav[aria-label="后台导航"]')).toBeVisible();
}

test("媒体上传：site_admin 上传 PNG → 列表出现 → 删除后消失", async ({ page }) => {
  // 每次跑用唯一文件名，避免与历史记录/上一次运行混淆
  const fileName = `e2e-${Date.now()}.png`;

  await login(page, "site_admin");
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "媒体库" })).toBeVisible();

  // 上传（内存构造，不触盘）
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "image/png",
    buffer: Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
  });
  await page.getByRole("button", { name: "上传" }).click();

  // 列表出现（`router.refresh()` 后由 `listMedia` 带出）
  const row = page.locator('[data-slot="media-item"]').filter({ hasText: fileName });
  await expect(row).toBeVisible();
  await expect(row).toContainText("image/png");
  await expect(row.locator("img")).toBeVisible();

  // 软删除（Server Action 表单，无 confirm）
  await row.getByRole("button", { name: "删除" }).click();
  await expect(row).toHaveCount(0);
});
