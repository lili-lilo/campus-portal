import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * 请求级 i18n 配置 —— **约定路径**：src/i18n/request.ts
 *（next-intl 的插件按 ./(src/)i18n/request.{js,jsx,ts,tsx} 解析，见 getNextConfig.js:56）
 *
 * 返回契约：`locale` 是唯一必填字段（getRequestConfig.d.ts:2）；messages 可选。
 * 语言包位置见 docs/15 §3.4：src/i18n/messages/{zh,en}.json
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // 只接受 routing.locales 里的值，其余一律回落默认语言（包内没有校验助手，自己过滤）
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? requested
      : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
    // docs/13 §5.1 R2：展示层统一 Asia/Shanghai
    timeZone: "Asia/Shanghai",
  };
});
