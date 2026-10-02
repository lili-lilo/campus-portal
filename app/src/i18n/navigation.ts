import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * 本地化导航 API（docs/15 §3.1）
 * 导出成员来自已安装包（createNavigation.d.ts:5-465）：
 *   Link / usePathname / useRouter / getPathname / redirect / permanentRedirect
 */
export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
