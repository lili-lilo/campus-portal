import { defineRouting } from "next-intl/routing";

/**
 * 路由级 i18n 配置（docs/15 §3.1 / A21）
 *   · zh 为默认语言 → URL **不带**前缀：/main/news
 *   · en 为非默认语言 → URL **带**前缀：/en/main/news
 * 取值来自已安装包的类型定义（routing/types.d.ts:2）：
 *   LocalePrefixMode = "always" | "as-needed" | "never"
 */
export const routing = defineRouting({
  locales: ["zh", "en"],
  defaultLocale: "zh",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
