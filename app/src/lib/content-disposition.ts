/**
 * RFC 6266 / 5987 双形式 `Content-Disposition`（M6 Step 2b 从 `lib/excel.ts` 抽出）。
 * ============================================================================
 * **为什么独立成模块**：`GET /api/files/[id]/download` 也要用它，而 `lib/excel.ts`
 * 顶层 `import * as ExcelJS from "exceljs"` ⇒ 从 excel.ts 复用会把整个 exceljs
 * 拉进下载端点的模块图。抽出后两个消费者各只依赖本文件（**零依赖、零副作用**）。
 * `lib/excel.ts` 保留 `export { contentDisposition }` 转发，3 个导出端点与
 * `buildXlsxResponse` 的调用点保持不变。
 *
 * ⚠ `Headers` 的值必须是 **ByteString**（含非 ASCII 会抛 `TypeError: Invalid character in header`）
 * ⇒ 中文名只能放 `filename*=UTF-8''<percent-encoded>`，并额外转义 RFC 5987 的保留字符 `'()` `*`；
 * `filename=` 给**纯 ASCII 回退**（老客户端 / 下载工具）—— **ASCII 性由调用方保证**
 * （如 `api/files/[id]/download/route.ts` 对 id/扩展名做白名单收敛）。
 */
export function contentDisposition(filename: string, asciiFallback: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
