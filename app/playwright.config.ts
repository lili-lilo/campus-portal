import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 配置（docs/16 §1.3）—— **仅本地**，不进 CI（docs/16 §5）
 *
 * 前置：`pnpm db:reset && pnpm db:seed`（E2E 依赖确定的种子数据与 4 个演示账号）
 * 隔离：单 worker + 串行（避免并发写同一篇稿件导致状态机用例互相干扰）
 * ⚠ 浏览器未安装：本地首次运行前需 `pnpm exec playwright install chromium`（DSH 侧不装）
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /**
   * ⚠ **跑 E2E 前请先关掉本地 `pnpm dev`**：`reuseExistingServer: true` 会复用 3000 端口上已有的
   * dev server —— 若刚执行过 `pnpm db:reset`，旧 server 持有的 SQLite 句柄可能仍指向被替换/删除的
   * 库文件（读到的还是旧数据、写入失败 ⇒ 表现为"点保存草稿不跳转"这类假回归）。
   * 需要强制新起：先关掉 dev，或让 `E2E_BASE_URL` 指向另一个端口。
   */
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/main",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
