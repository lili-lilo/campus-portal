import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * 组件测试公共 setup（docs/16 §1.1）
 *
 * · `@testing-library/jest-dom/vitest` —— 注册 DOM 匹配器（`toBeInTheDocument` 等）
 * · 本配置**未启用 `globals`**（单测显式 import `describe/it/expect`，避免改 tsconfig 的 types），
 *   因此 React Testing Library 的自动 cleanup 不会生效，需手动注册 `afterEach(cleanup)`
 */
afterEach(() => {
  cleanup();
});
