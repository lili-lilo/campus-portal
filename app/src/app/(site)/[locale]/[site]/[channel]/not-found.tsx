import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * 栏目级 404（docs/15 §6.2 U2 的兜底 + U-C 裁决）
 *
 * 触发场景：
 *   · 栏目不存在（CHANNEL_TYPES 里查不到）
 *   · `Channel.type='form'` —— docs/14 §8 A2 裁决本期不渲染前台表单 → 调 notFound()
 * 因此文案同时覆盖"不存在"与"暂未开放"两种情况。
 *
 * M5-1b-2 补：文案迁 i18n（`channelNotFound.*` + `common.backHome`）。
 * `not-found.tsx` **拿不到 `params`**（Next 约定），故用**请求级** `getTranslations()`
 * —— 本文件在 `[locale]` 之下，locale 由 `i18n/request.ts` 的 `getRequestConfig` 提供 ✓。
 */
export default async function ChannelNotFound() {
  const t = await getTranslations("channelNotFound");
  const tCommon = await getTranslations("common");

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-4xl font-semibold tracking-tight text-muted-foreground">404</p>
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Link
        href="/"
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {tCommon("backHome")}
      </Link>
    </main>
  );
}
