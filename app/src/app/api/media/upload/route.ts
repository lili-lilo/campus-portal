import { NextResponse } from "next/server";

import { requireSession } from "@/lib/actions-shared";
import { failResponse } from "@/lib/api-response";
import { can, isSuperAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { MEDIA_FOLDERS, getStorage, type MediaFolder } from "@/lib/storage";

/**
 * 媒体上传（T3.6a）—— `docs/14` §6.1 L613-L622 / §4 L377：`POST /api/media/upload`
 * ============================================================================
 * 契约：`multipart/form-data`，字段 `file`（必填）、`folder`（枚举）、`siteId`（可空）；
 * 返回 **`Ok<Media>`**；**不幂等**（重复上传即两条记录，前端按 `name+size` 去重提示）。
 *
 * 鉴权（**必须自己做**）：`src/proxy.ts` 的 matcher 明确排除 `api`
 * （L56 注释「api → Route Handler 自行鉴权」、L61 matcher）⇒ 本端点内做 **L1 + L2**。
 *
 * 体积：`docs/14` §2.2 L133 的 `PAYLOAD_TOO_LARGE`（上传 > 10MB）——
 * **先按 `Content-Length` 预检**（避免把超大 body 读进内存），**再以 `file.size` 为准**。
 *
 * 类型白名单：`image/jpeg | image/png | image/webp | image/gif`。
 * **刻意不含 `image/svg+xml`** —— SVG 可内嵌脚本，而 `public/` 下是同源托管，有 XSS 面。
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** multipart 边界与头部开销余量（预检用；最终以 `file.size` 判定） */
const CONTENT_LENGTH_SLACK = 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

function isMediaFolder(value: unknown): value is MediaFolder {
  return typeof value === "string" && (MEDIA_FOLDERS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  // ── L1：会话（未登录 401 / 角色异常 403）────────────────────────────────
  const scope = await requireSession();
  if (!scope.ok) {
    return failResponse(scope.fail.code === "UNAUTHORIZED" ? 401 : 403, {
      code: scope.fail.code,
      message: scope.fail.message,
    });
  }
  const { session } = scope;

  // ── L2：`media.upload`（docs/14 §4 L377）───────────────────────────────
  if (!can(session.role, "media.upload")) {
    return failResponse(403, { code: "FORBIDDEN", message: "无权上传媒体。" });
  }

  // ── 体积预检（可选但便宜；缺失时跳过，交给下面的 file.size）─────────────
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES + CONTENT_LENGTH_SLACK) {
    return failResponse(413, { code: "PAYLOAD_TOO_LARGE", message: "文件超过 10MB。" });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return failResponse(400, {
      code: "VALIDATION_FAILED",
      message: "请求体不是合法的 multipart/form-data。",
    });
  }

  const rawFile = formData.get("file");
  if (!(rawFile instanceof File)) {
    return failResponse(400, { code: "VALIDATION_FAILED", message: "缺少 file 字段。" });
  }

  // ── 体积主判 ──────────────────────────────────────────────────────────
  if (rawFile.size > MAX_UPLOAD_BYTES) {
    return failResponse(413, { code: "PAYLOAD_TOO_LARGE", message: "文件超过 10MB。" });
  }

  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(rawFile.type)) {
    return failResponse(415, {
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: "只支持 JPEG / PNG / WebP / GIF 图片。",
    });
  }

  const folderRaw = formData.get("folder");
  const folder: MediaFolder = isMediaFolder(folderRaw) ? folderRaw : "other";

  const siteIdRaw = formData.get("siteId");
  const requestedSiteId =
    typeof siteIdRaw === "string" && siteIdRaw.trim() !== "" ? siteIdRaw.trim() : null;
  // 数据范围：super_admin 按入参（null = 全站共享）；其余角色锁本站（schema L262-L263）
  const siteId = isSuperAdmin(session.role) ? requestedSiteId : session.siteId;

  const buffer = Buffer.from(await rawFile.arrayBuffer());

  let stored: { path: string; url: string };
  try {
    stored = await getStorage().put({
      buffer,
      originalName: rawFile.name,
      folder,
      mimeType: rawFile.type,
    });
  } catch (error) {
    console.error("[api/media/upload] 落盘失败：", error);
    return failResponse(500, { code: "INTERNAL_ERROR", message: "文件写入失败，请稍后重试。" });
  }

  const media = await prisma.media.create({
    data: {
      siteId,
      type: rawFile.type.startsWith("image/") ? "image" : "file",
      name: rawFile.name,
      path: stored.path,
      size: rawFile.size,
      mimeType: rawFile.type,
      folder,
      // `uploader` 非空（schema.prisma L278）；`uploaderId` 是真外键
      uploader: session.userLabel,
      uploaderId: session.userId,
    },
    // 显式 select：不回传 `uploaderUser` / `articles` / `attachments` 等关系字段
    select: {
      id: true,
      siteId: true,
      type: true,
      name: true,
      path: true,
      size: true,
      mimeType: true,
      width: true,
      height: true,
      folder: true,
      album: true,
      uploader: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, data: media });
}
