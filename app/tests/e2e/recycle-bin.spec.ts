import { expect, test, type Page } from "@playwright/test";

/**
 * 回收站可恢复（`docs/16` §2.4 四步 + L177 的 `SOFT_DELETED`）—— **M4 批次 2b 起真跑**
 * ============================================================================
 * · 单元/后端已由批次 2a 落盘（`deleteArticle` + `listRecycleBin` / `restoreFromRecycle` /
 *   `purgeFromRecycle`）；本 spec 覆盖**端到端四步**
 * · 每篇稿件由 **editor 现场新建并走完整审核链推到 `published`**：保证 C4（`editor` 仅本人）
 *   与 §2.4 第 1 步"删除一篇 `published` 文章"两个前提同时成立
 * · 断言锚点：`[data-slot="recycle-item"]`（回收站行）、`[data-slot="article-status"]`（编辑页徽标）
 * · 前台可见性用**搜索页的详情链接**判定（链接以 slug 结尾，删除后应为 0 条）：
 *   C5 = `status='published' AND deletedAt IS NULL AND (publishTime IS NULL OR publishTime <= now)`
 * · 第 4 步的 `Attachment` 级联**不直接断言** —— 由 `schema.prisma` L312 的 `onDelete: Cascade`
 *   保证，按 `docs/16` §2.3 的 D-2 模式（见 §2.4 范围注）
 *
 * ⚠ 前置：`pnpm db:reset && pnpm db:seed`
 */

const PASSWORD = "admin123";

test.beforeEach(({ page }) => {
  // 「删除 / 恢复 / 彻底删除」都会弹 confirm：一律接受（有监听器时 Playwright 不再自动 dismiss）
  page.on("dialog", (dialog) => void dialog.accept());
});

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
  // 已登录的后台外壳（登录页没有侧边栏 nav）⇒ 证明 cookie 已生效
  await expect(page.locator('nav[aria-label="后台导航"]')).toBeVisible();
}

async function expectStatus(page: Page, label: string) {
  await expect(page.locator('[data-slot="article-status"]')).toHaveText(label);
}

/** 前台搜索页里"该文章详情链接"是否存在（链接以 slug 结尾；`false` = 应有 0 条） */
async function expectFrontEndHit(page: Page, title: string, slug: string, visible: boolean) {
  await page.goto(`/main/search?q=${encodeURIComponent(title)}`);
  const link = page.locator(`a[href$="/${slug}"]`);

  if (visible) {
    await expect(link.first()).toBeVisible();
  } else {
    await expect(link).toHaveCount(0);
  }
}

/**
 * editor 新建草稿 → 提交初审 → auditor 初审通过并发布 → 返回 `{ editUrl, slug }`。
 * 正文用 `pressSequentially`（逐字符键入）：`keyboard.type()` 走 CDP insertText，
 * Tiptap 3.x 下不进 ProseMirror 事务；栏目必须在 hydration 之后再选（同 audit-workflow 的教训）。
 */
async function createPublishedAsEditor(
  page: Page,
  title: string,
): Promise<{ editUrl: string; slug: string }> {
  await login(page, "editor");
  await page.goto("/admin/articles/new");

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially(`${title}：回收站测试正文。`);
  await expect(editor).toContainText("回收站测试正文");

  await page.fill('input[name="title"]', title);

  const channelSelect = page.locator('select[name="channelId"]');
  await channelSelect.selectOption({ index: 1 });
  await expect(channelSelect).not.toHaveValue("");

  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/admin\/articles$/);

  await page.locator("tbody tr").first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/articles\/[^/]+\/edit$/);

  const editUrl = page.url();
  const slug = await page.locator('input[name="slug"]').inputValue();

  // 审核链：editor 提交 → auditor 初审 → auditor 发布
  await page.getByRole("button", { name: "提交初审" }).click();
  await expectStatus(page, "待初审");

  await login(page, "auditor");
  await page.goto(editUrl);
  await page.getByRole("button", { name: "初审通过" }).click();
  await expectStatus(page, "待终审");
  await page.getByRole("button", { name: "发布" }).click();
  await expectStatus(page, "已发布");

  return { editUrl, slug };
}

/** editor 打开编辑页点「删除」（软删除进回收站）→ 断言跳回列表 */
async function deleteViaUi(page: Page, editUrl: string) {
  await login(page, "editor");
  await page.goto(editUrl);
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/articles$/);
}

/** 回收站里定位某标题的行 */
function recycleRow(page: Page, title: string) {
  return page.locator('[data-slot="recycle-item"]').filter({ hasText: title });
}

test.describe("回收站（M4 批次 2b 解除 skip）", () => {
  test("第 1 步：删除 published 文章 → 跳回列表、前台查不到、记录仍在（SOFT_DELETED）", async ({
    page,
  }) => {
    const { editUrl, slug } = await createPublishedAsEditor(page, "回收1 删除");
    await expectFrontEndHit(page, "回收1 删除", slug, true); // 删除前前台可见

    await deleteViaUi(page, editUrl);

    // C5：前台（搜索页）不再出现
    await expectFrontEndHit(page, "回收1 删除", slug, false);

    // 记录仍在：编辑页给 SOFT_DELETED 提示（不是 404 ⇒ 行还在库里）
    await page.goto(editUrl);
    await expect(page.locator('p[role="alert"]')).toContainText("回收站");
  });

  test("第 2 步：回收站列表出现该文章", async ({ page }) => {
    const { editUrl } = await createPublishedAsEditor(page, "回收2 列表");
    await deleteViaUi(page, editUrl);

    await login(page, "editor");
    await page.goto("/admin/recycle");

    await expect(recycleRow(page, "回收2 列表")).toBeVisible();
  });

  test("第 3 步：恢复 → 行消失、状态仍为 published、前台重新可见", async ({ page }) => {
    const { editUrl, slug } = await createPublishedAsEditor(page, "回收3 恢复");
    await deleteViaUi(page, editUrl);

    await login(page, "editor");
    await page.goto("/admin/recycle");

    const row = recycleRow(page, "回收3 恢复");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "恢复" }).click();
    await expect(row).toHaveCount(0);

    // §2.4 L174：状态**不重置**（仍为删除前的 published）
    await page.goto(editUrl);
    await expectStatus(page, "已发布");

    // 前台重新可见
    await expectFrontEndHit(page, "回收3 恢复", slug, true);
  });

  test("第 4 步：彻底删除 → 行消失、编辑页 404（Attachment 级联由 onDelete 保证）", async ({
    page,
  }) => {
    const { editUrl } = await createPublishedAsEditor(page, "回收4 彻底删除");

    // delete → restore → 再 delete → purge（顺带覆盖"恢复后再删"这条真实路径）
    await deleteViaUi(page, editUrl);
    await login(page, "editor");
    await page.goto("/admin/recycle");
    await recycleRow(page, "回收4 彻底删除").getByRole("button", { name: "恢复" }).click();
    await expect(recycleRow(page, "回收4 彻底删除")).toHaveCount(0);

    await deleteViaUi(page, editUrl);
    await login(page, "editor");
    await page.goto("/admin/recycle");

    const row = recycleRow(page, "回收4 彻底删除");
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "彻底删除" }).click();
    await expect(row).toHaveCount(0);

    // 物理删除 ⇒ 编辑页回到 404（`getArticle` 查不到 → `notFound()`）
    // ⚠ `Attachment` 级联（schema.prisma L312 `onDelete: Cascade`）不在此断言：UI 不可见，
    //   按 docs/16 §2.3 的 D-2 模式由 schema 语义保证（见 §2.4 的范围注）
    await page.goto(editUrl);
    await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
  });

  test("对回收站中的文章执行编辑 → SOFT_DELETED 提示，并可跳转回收站恢复", async ({ page }) => {
    const { editUrl } = await createPublishedAsEditor(page, "回收5 软删提示");
    await deleteViaUi(page, editUrl);

    await page.goto(editUrl);

    // 页面**活着**并给出契约码文案（docs/16 §2.4 L177；docs/14 §2.2 L132）
    await expect(page.locator('p[role="alert"]')).toContainText("该文章在回收站中");
    await expect(page.getByRole("heading", { name: "页面不存在" })).toHaveCount(0);

    await page.getByRole("link", { name: "去回收站恢复" }).click();
    await expect(page).toHaveURL(/\/admin\/recycle$/);
    await expect(recycleRow(page, "回收5 软删提示")).toBeVisible();
  });
});
