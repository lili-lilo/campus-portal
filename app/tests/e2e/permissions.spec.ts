import { expect, test } from "@playwright/test";

/**
 * 4 角色越权拒绝（docs/16 §2.3）—— **本地专用**
 *
 * T1.9 范围（裁决 Q4 变体）：
 *   · **真跑**：用例 6「未登录访问 /admin/articles → 302 /admin/login?callbackUrl=…」
 *     —— 只依赖 T1.6 的 `proxy.ts` + T1.8 的登录页，现在就能验证
 *   · **`.skip`**：用例 1~5（依赖第 3~4 周的 Server Action / RBAC）
 */

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

test.describe.skip("4 角色越权（待第 3~4 周 Server Action / RBAC 就绪）", () => {
  test("用例 1：editor 调用发布动作 → 403 / 界面无发布按钮", async () => {
    // TODO（第 4 周）：直接调接口被拒（FORBIDDEN）
  });

  test("用例 2：editor 编辑他人稿件 → 403（约束 C4）", async () => {
    // TODO（第 3~4 周）
  });

  test("用例 3：auditor 新建文章 → 403 / 界面无新建按钮", async () => {
    // TODO（第 3 周）
  });

  test("用例 4：site_admin 访问其它站点内容 → 403（L3 数据范围）", async () => {
    // TODO（第 4 周）
  });

  test("用例 5：editor 撤稿已发布文章 → 403", async () => {
    // TODO（第 4 周）
  });
});
