import { defineConfig, devices } from "@playwright/test";

/**
 * 演示录屏专用配置（M6）—— **本地手动跑，不进 CI**
 * ============================================================================
 * 为什么需要单独一份：`playwright.config.ts` 的 `testDir` 是 `tests/e2e`，而录屏脚本按需求放在
 * **`tests/demo-video.spec.ts`**（在 testDir 之外）。Playwright 的路径参数只是"已收集文件的
 * 过滤器"、**不会扩大扫描目录** ⇒ 用主配置跑 `playwright test tests/demo-video.spec.ts`
 * 会报 `Error: No tests found`（已实测）。故本文件把 `testDir` 放宽到 `tests` 并用
 * `testMatch` 只收这一个文件 ⇒ **主配置与 `pnpm test:e2e` 行为完全不变**。
 *
 * 运行（dev 已在 3000 跑着时可直接执行）：
 *   cd D:\workspace\app
 *   pnpm exec playwright test --config=playwright.demo.config.ts --project=chromium
 *
 * 成片：`docs/演示视频/demo.webm`（脚本内 `video.saveAs()` 复制；该目录已被根 `.gitignore` 排除）
 */
export default defineConfig({
  testDir: "tests",
  testMatch: "**/demo-video.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  /**
   * 与主配置同口径：`reuseExistingServer: true` ⇒ dev 已在跑就直接复用；
   * ⚠ 录屏期间**不要**跑 `pnpm typecheck`（它会删 `.next/dev/types`，Next 会判定目录被删而重启）。
   */
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/main",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
