import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";

/**
 * locale 段布局（U-B 裁决新增；docs/15 §1 路由树已同步回写）
 *
 * 分工（U-B）：
 *   · 根 layout（src/app/layout.tsx）继续持有 <html>/<body>、字体变量与无障碍内联脚本
 *   · 本层只做两件事：① 标记静态渲染用的 locale；② 挂 NextIntlClientProvider
 *     （客户端组件需要 useTranslations 时由它提供；RSC 渲染时 locale/messages 自动接收）
 */
export function generateStaticParams() {
  return [{ locale: "zh" }, { locale: "en" }];
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // 让本段及其子页可走静态渲染（ISR）；否则 next-intl 的 Server API 会强制动态渲染
  setRequestLocale(locale);

  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
