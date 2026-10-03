import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * 站点级 404（docs/15 §6.1 / §6.2 U2）
 * 触发场景：站点 slug 不存在、栏目不存在、`page` 型栏目无 Page 记录。
 * 依据 U2 裁决：文章/栏目不存在时**不回落到栏目列表**（避免"点进去看到列表"的迷惑）。
 *
 * M5-1b-2 补：文案迁 i18n（`siteNotFound.*` + `common.backHome`）；同为**请求级**取文案
 * （`not-found.tsx` 拿不到 `params`，但本文件在 `[locale]` 之下）。
 */
export default async function SiteNotFound() {
  const t = await getTranslations("siteNotFound");
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
