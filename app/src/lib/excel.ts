import * as ExcelJS from "exceljs";
import { NextResponse } from "next/server";

/**
 * Excel 导出公共层（M5-5a / `docs/14` §6.2 L628-L632）
 * ============================================================================
 * 三个导出端点（`articles` / `form-data` / `statistics`）共用本模块；M5-5a 只落
 * `/api/export/form-data`，另两个留 M5-5b。
 *
 * **exceljs 打包事实（M5-5a 探路实测，供后人排查）**：
 *   · `exceljs@4.4.0` **不在** Next 的自动外置清单里（随包
 *     `docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md` L19-L99）
 *     ⇒ 会被 Turbopack 打包；
 *   · 入口 `excel.js` **L13** `module.exports = require('./lib/exceljs.nodejs.js')`（显式 Node 变体），
 *     其 **L1-L14** 导出 `{ Workbook, ModelContainer, stream, …enums }`；
 *   · 全库**非字面量 require = 0 处**（无 `require(变量)`，打包器无需动态解析）
 *     ⇒ 当前**未**加 `serverExternalPackages`（用户裁决：build 实测后再定）。
 *   · 类型入口 = `index.d.ts`：`export class Workbook`（L1707）等**具名导出**，无 `export =`/`default`
 *     ⇒ 本文件用 `import * as ExcelJS`（类型位 `ExcelJS.Workbook` 与值位 `new ExcelJS.Workbook()` 都可用）。
 *
 * ⚠ **不要安装 `@types/exceljs`**：其 registry 原文自述为 stub（`exceljs` 自带类型），
 *   且 `dependencies: { "exceljs": "*" }` 会反向拉入本体形成循环依赖（`docs/12` §6.1 五 L351-L357）。
 */

/** 单次导出行数上限（`docs/14` L632：超出 → `VALIDATION_FAILED`，提示收窄筛选） */
export const MAX_EXPORT_ROWS = 10_000;

/** `.xlsx` 官方 MIME（Office Open XML） */
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * RFC 6266 / 5987 双形式 `Content-Disposition`。
 *
 * ⚠ `Headers` 的值必须是 **ByteString**（含非 ASCII 会抛 `TypeError: Invalid character in header`）
 * ⇒ 中文名只能放 `filename*=UTF-8''<percent-encoded>`，并额外转义 RFC 5987 的保留字符 `'()` `*`；
 * `filename=` 给**纯 ASCII 回退**（老客户端 / 下载工具）。
 */
function contentDisposition(filename: string, asciiFallback: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * 把构造好的 workbook 变成 `.xlsx` 下载响应。
 *
 * 用 `workbook.xlsx.writeBuffer()`（**非真流式**）：契约把单次上限锁在 `MAX_EXPORT_ROWS`，
 * 缓冲的体量可控；真流式需 Node→Web 流桥接，收益不成比例（M5-5a 裁决 Q2）。
 * `Cache-Control: no-store` —— 后台数据不进中间缓存。
 */
export async function buildXlsxResponse(input: {
  workbook: ExcelJS.Workbook;
  /** 下载文件名（可含中文，走 `filename*`） */
  filename: string;
  /** 纯 ASCII 回退名（缺省 `export.xlsx`） */
  asciiFilename?: string;
}): Promise<NextResponse> {
  // `index.d.ts` L1 `declare interface Buffer extends ArrayBuffer {}` ⇒ 直接可作 BodyInit
  const buffer = await input.workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": contentDisposition(
        input.filename,
        input.asciiFilename ?? "export.xlsx",
      ),
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 失败响应（`docs/14` §2.1 信封）—— 实现在 **`@/lib/api-response.ts`**（M6 Step 1 抽取）。
 *
 * 本处是**转发导出**（方案②）：3 个导出端点（`articles` / `form-data` / `statistics`）
 * 的 import 路径与调用方式**零改动**。
 */
export { failResponse } from "@/lib/api-response";
