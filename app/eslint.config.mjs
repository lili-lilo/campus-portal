import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma 生成物（构建产物，`prisma generate` 即可重建）。
    // 显式声明，与 .gitignore 的 /src/generated/、.prettierignore 的 src/generated/
    // 形成一致的三重声明；不依赖 eslint-config-next 默认行为。
    "src/generated/**",
  ]),
]);

export default eslintConfig;
