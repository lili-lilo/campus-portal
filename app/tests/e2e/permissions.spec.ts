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
  // 已登录的后台外壳（登录页没有侧边栏 nav）⇒ 证明 cookie 已生效，避免后续 goto 被 302 后
  // 拿到 200 而误判"页面 gate 没生效"
  await expect(page.locator('nav[aria-label="后台导航"]')).toBeVisible();
}

/**
 * 以指定账号新建草稿 → 返回编辑页 URL（同 `audit-workflow.spec.ts` 的 helper）
 *
 * @param channelLabel 指定时按**栏目下拉的 label 精确选择**（跨站点场景：`super_admin` 的下拉含
 *   4 个站点的栏目，label 形如 `新闻动态（计算机学院）` —— 站点名后缀见 `article-form.tsx` L171-L177）；
 *   缺省仍选 `index: 1`（第一个真实栏目）。
 */
async function createDraft(
  page: Page,
  username: string,
  title: string,
  channelLabel?: string,
): Promise<string> {
  await login(page, username);
  await page.goto("/admin/articles/new");

  // ⚠ 顺序即修复：`selectOption` 必须在 **hydration 之后**做。此前它紧跟 `goto`，
  //   落在尚未 hydration 的 DOM 上 ⇒ 原生 `change` 事件没有 React 监听 ⇒ DOM 显示已选、
  //   **RHF state 仍为 `""`** ⇒ zod 只报「请选择栏目」（T4.1c "保存被拦" 的真因）。
  //   这里先用 Tiptap 打字并断言（客户端组件，等价于 hydration 屏障），再填标题与栏目。
  //   正文另需 `pressSequentially`：`keyboard.type()` 走 CDP insertText，
  //   Tiptap 3.x 下不进 ProseMirror 事务 ⇒ `content` 为空串。
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await editor.pressSequentially(`${title}：越权测试正文。`);
  await expect(editor).toContainText("越权测试正文");

  await page.fill('input[name="title"]', title);

  const channelSelect = page.locator('select[name="channelId"]');
  if (channelLabel === undefined) {
    await channelSelect.selectOption({ index: 1 }); // index 0 = 「请选择栏目」(value="")
  } else {
    await channelSelect.selectOption({ label: channelLabel });
  }
  await expect(channelSelect).not.toHaveValue("");

  await page.getByRole("button", { name: "保存草稿" }).click();

  // 失败自解释：把被拦的真实原因打出来
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

async function expectStatus(page: Page, label: string): Promise<void> {
  await expect(page.locator('[data-slot="article-status"]')).toHaveText(label);
}

async function clickWorkflow(page: Page, name: string): Promise<void> {
  const before = await page.locator('[data-slot="audit-item"]').count();
  await page.getByRole("button", { name }).click();
  await expect(page.locator('[data-slot="audit-item"]')).toHaveCount(before + 1);
}

/**
 * 断言某路径对**当前角色** 404（gate 生效）。
 *
 * ⚠ **不断言 HTTP status**：Next 16 App Router（本仓还有 `proxy.ts` 的 locale 前缀 rewrite）下，
 * `notFound()` 渲染出的 404 页面 `response.status()` 实测**可能是 200** —— 用户实测证据：
 * 页面显示「页面不存在」，status 却是 200。⇒ 改断言 **DOM**（`app/src/app/not-found.tsx` L12 的 `<h1>`）。
 * 未登录时 `goto` 会被 proxy 302 到登录页，此时 DOM 断言同样会失败（登录页没有该标题）✓
 */
async function gotoExpect404(page: Page, path: string) {
  const response = await page.goto(path);

  if (response?.status() !== 404) {
    console.log(
      "注：HTTP status =",
      response?.status(),
      "（Next 16 下 404 页也可能是 200，故不作断言依据）｜url =",
      response?.url(),
    );
  }

  await expect(page.getByRole("heading", { name: "页面不存在" })).toBeVisible();
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

    await clickWorkflow(page, "提交初审"); // editor：draft → pending_first

    // auditor 侧：**先**断言它确实在 pending_first（此时按钮是「初审通过 / 退回」，本就没有「发布」），
    // 再初审通过推到 pending_final —— 只有到这一步，「发布」才对 auditor 可见
    await login(page, "auditor");
    await page.goto(editUrl);
    await expectStatus(page, "待初审");
    await clickWorkflow(page, "初审通过");
    await expectStatus(page, "待终审");
    await expect(page.getByRole("button", { name: "发布" })).toBeVisible();

    // editor 侧：pending_final，但无 `article.publish` ⇒ 界面无「发布」「退回」
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
    await gotoExpect404(page, othersUrl);

    await expect(page.locator('[data-slot="article-status"]')).toHaveCount(0);
  });

  test("用例 3：auditor 无新建入口，直接访问 /admin/articles/new → 404", async ({ page }) => {
    await login(page, "auditor");
    await page.goto("/admin/dashboard");

    // ① 菜单层（T3.1）：auditor 的菜单 = menu.dashboard / menu.audits / menu.comments
    await expect(page.locator('a[href="/admin/audits"]')).toBeVisible();
    await expect(page.locator('a[href="/admin/articles"]')).toHaveCount(0);

    // ② 页面层 gate（T4.1c 补）：直接输 URL 也被挡 —— docs/15 §9.1 L423 的权限列 = `article.create`
    await gotoExpect404(page, "/admin/articles/new");
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

  test("用例 4：site_admin 访问其它站点内容 → 404（L3 数据范围）", async ({ page }) => {
    // 用 super_admin（admin）把稿子建到**计算机学院**站点下：跨站时栏目下拉会带站点名后缀
    // （`article-form.tsx` L171-L177），故可按 label 精确选择（子站有 list 栏目：seed L139-L142）
    const crossSiteUrl = await createDraft(
      page,
      "admin",
      "越权4 跨站稿件",
      "新闻动态（计算机学院）",
    );

    const id = crossSiteUrl.match(/\/admin\/articles\/([^/]+)\/edit$/)?.[1] ?? "";
    expect(id).not.toBe("");

    // `site_admin` 属 main 站（seed L157）⇒ 打开别站稿件必须被 L3 挡下（`getArticle` 的 `inScope`）
    await login(page, "site_admin");
    await gotoExpect404(page, `/admin/articles/${id}/edit`);

    // 列表层同样看不到（站点范围过滤），不只是一页 gate
    await page.goto("/admin/articles?keyword=越权4");
    await expect(page.locator("tbody tr")).toHaveCount(0);
  });
});
