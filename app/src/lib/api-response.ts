import { NextResponse } from "next/server";

/**
 * Route Handler 的统一失败信封（`docs/14` §2.1）。
 * - `field` 仅在非空时输出（与 excel.ts 历史实现逐字一致，避免响应体字节差异）。
 * - `code` 用宽 `string`：调用方各自传字面量，不引 Action 层的 ApiErrorCode。
 * - 不含 `Cache-Control` 等附加头（历史上失败侧从未设过头）。
 */
export function failResponse(
  status: number,
  failure: { code: string; message: string; field?: string },
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: failure.code,
      message: failure.message,
      ...(failure.field ? { field: failure.field } : {}),
    },
    { status },
  );
}
