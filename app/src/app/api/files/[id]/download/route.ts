import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { failResponse } from "@/lib/api-response";
import { contentDisposition } from "@/lib/content-disposition";
import { prisma } from "@/lib/prisma";

/**
 * 附件下载（M6 Step 2）—— `GET /api/files/[id]/download`
 * ============================================================================
 * 契约：`docs/14` §4.1 L241 / §5.3 L389-L398 —— **公开**端点；置
 * `Content-Disposition: attachment`；`downloadCount` **原子 +1**。
 *
 * 可见性（比契约字面更严，防"拿到 id 就能下草稿附件"）：记录未软删 + 至少一个宿主
 * + 宿主必须 `status = "published"` 且未软删。
 *
 * 越界防护：`filePath` 必须以 `/uploads/` 开头，且 `path.resolve` 后仍落在
 * `app/public/uploads` 之内（防 DB 被污染导致的任意文件读），守卫写法照
 * `src/lib/storage.ts` L75-L78 的 `delete()`。
 *
 * ⚠ 生产（A33 待办）：`STORAGE_DRIVER=supabase` 时，宿主校验通过后本路由返回 **501**
 *   （不存在/未发布的附件仍先 404）——`SupabaseStorageAdapter` 尚未实现，见
 *   `src/lib/storage.ts` L109-L110。该适配器落地后，本路由应改为
 *   **302 到 Supabase Storage 签名 URL**（与 `docs/14` §5.3 L378 对 `/api/files/[...path]`
 *   的"本地读盘 / 生产 302"口径一致），本地读盘分支届时退化为开发专用。
 *
 * 本步**只做 GET**：不实现 POST / HEAD，不实现 `/api/files/[...path]`，不做限流（A24 明确不做）。
 */

/** 与 `src/lib/storage.ts` L42 的 `UPLOAD_ROOT` 同构造法（该常量未导出，故此处就地重建） */
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/** `Attachment.filePath` 的强制前缀（站点根相对路径；见 `seed.ts` L1315 与 `LocalStorageAdapter.put`） */
const UPLOAD_PREFIX = "/uploads/";

/**
 * 统一 404：**不区分**"记录不存在 / 已软删 / 宿主未发布 / 路径非法 / 文件缺失"，
 * 避免用状态码差异探测记录或文件的存活性（照 `docs/14` §8 A7 的"404 防探测"口径）。
 */
function notFound() {
  return failResponse(404, { code: "NOT_FOUND", message: "附件不存在" });
}

/**
 * `Content-Disposition` 的 ASCII 回退名：`attachment-<id>.<ext>`，`ext` 由 `fileName` 派生。
 *
 * ⚠ `filename=` 的值必须是 **ByteString**（`lib/excel.ts` L31-L36 的实测结论）⇒ 此处对
 * `id` 与 `ext` 都做 ASCII 白名单收敛：只有纯 `[A-Za-z0-9]` 扩展名才保留，否则退化为
 * `attachment-<id>`（无扩展名）。中文原名仍走 `filename*=UTF-8''`，不受影响。
 */
function asciiFallbackName(id: string, fileName: string): string {
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "file";
  const ext = path.extname(fileName);
  const safeExt = /^\.[A-Za-z0-9]{1,16}$/.test(ext) ? ext : "";
  return `attachment-${safeId}${safeExt}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment || attachment.deletedAt !== null) {
    return notFound();
  }

  // 孤儿附件：两个宿主都为空
  if (attachment.articleId === null && attachment.pageId === null) {
    return notFound();
  }

  // 宿主可见性：文章（草稿 / 已软删的文章，其附件不可下载）
  if (attachment.articleId !== null) {
    const article = await prisma.article.findUnique({
      where: { id: attachment.articleId },
      select: { status: true, deletedAt: true },
    });
    if (!article || article.status !== "published" || article.deletedAt !== null) {
      return notFound();
    }
  }

  // 宿主可见性：单页
  if (attachment.pageId !== null) {
    const page = await prisma.page.findUnique({
      where: { id: attachment.pageId },
      select: { status: true, deletedAt: true },
    });
    if (!page || page.status !== "published" || page.deletedAt !== null) {
      return notFound();
    }
  }

  // 生产存储未接入（A33）：**宿主校验之后**才判 501 ⇒ 不存在的附件仍先 404
  // （生产环境下也不泄露"记录是否存在"的差异）；存在的附件在此明确 501。
  if (process.env.STORAGE_DRIVER === "supabase") {
    return failResponse(501, { code: "INTERNAL_ERROR", message: "生产存储未接入（见 A33）" });
  }

  // 路径白名单 + 越界防护
  if (!attachment.filePath.startsWith(UPLOAD_PREFIX)) {
    return notFound();
  }
  const target = path.resolve(path.join(process.cwd(), "public", attachment.filePath));
  if (!target.startsWith(UPLOAD_ROOT + path.sep)) {
    return notFound();
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // 记录在库但文件不在盘上（如 seed 的 `/uploads/seed/**`）：不计数
      console.warn(`[files/download] attachment ${id} file missing: ${attachment.filePath}`);
      return notFound();
    }
    console.error("[api/files/[id]/download] 读取失败：", error);
    return failResponse(500, { code: "INTERNAL_ERROR", message: "文件读取失败" });
  }

  // 读盘成功后才计数：单语句 increment 本身即原子。
  // 计数失败**不阻断下载**（M6 Step 2b）：告警后照常下发文件（200）。
  try {
    await prisma.attachment.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
  } catch (error) {
    console.warn("[files/download] downloadCount 自增失败：", error);
  }

  // ⚠ 类型要点（typecheck 实测）：`node:fs/promises#readFile` 返回 `Buffer<ArrayBufferLike>`，
  //   它**不满足** DOM 的 `BodyInit`（TS2345）。`lib/excel.ts` 的 `buildXlsxResponse` 之所以能
  //   直接传 `buffer`，是因为 exceljs 自带 `declare interface Buffer extends ArrayBuffer {}`。
  //   故此处显式复制成 `Uint8Array<ArrayBuffer>`（附件 ≤ 10MB，复制成本可忽略）。
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": attachment.mimeType ?? "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": contentDisposition(
        attachment.fileName,
        asciiFallbackName(id, attachment.fileName),
      ),
      "Cache-Control": "no-store",
    },
  });
}
