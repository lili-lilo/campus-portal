import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Vitest 配置（Vitest 5，docs/16 §1.1/§1.2）
 *
 * 两个 project：
 *   · `unit`      —— 纯函数单测，`environment: node`，**不需要数据库**（P-3 原则）
 *   · `component` —— 关键组件测试，`environment: jsdom`（3 个组件待第 2~5 周交付，当前为 `.skip` 骨架）
 *
 * 说明：
 *   · **不使用 globals** —— 每个用例显式 `import { describe, expect, it } from "vitest"`，
 *     这样无需改 `tsconfig.json` 的 `types`（避免影响全项目类型环境）
 *   · `@` 别名在这里显式声明（没有装 `vite-tsconfig-paths`，不新增依赖）
 *   · `pool: "threads"` —— 避免 fork 子进程的 IPC 管道（受限环境下更稳）
 *   · E2E 归 Playwright（`tests/e2e/**`），**不**在 Vitest 的 include 内
 */

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": path.resolve(projectRoot, "src") };

export default defineConfig({
  test: {
    // 根级：两个 project 都可能暂时没有用例（组件测试待第 2~5 周交付）
    passWithNoTests: true,
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          pool: "threads",
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "component",
          include: ["tests/component/**/*.test.tsx"],
          environment: "jsdom",
          pool: "threads",
          setupFiles: ["tests/setup.ts"],
        },
      },
    ],
  },
});
