import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl 约定：默认先找 ./i18n/request.*，再找 ./src/i18n/request.*。
// 本项目代码在 src/ 下，显式传**相对**路径以消除歧义
//（next-intl 在 Turbopack 下拒绝绝对路径 —— 见 dist/esm/plugin/getNextConfig.js:125）。
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {/* config options here */};

export default withNextIntl(nextConfig);
