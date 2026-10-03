"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * 媒体上传区（T3.6b）—— **本批唯一的新客户端组件**
 * ============================================================================
 * · 走 `POST /api/media/upload`（`docs/14` §6.1 L613-L622）：**非 JSON 的 multipart 必须用 Route Handler**
 *   （Server Action 只走 RSC 协议，`docs/14` §2.1 L50）
 * · 字段名与端点一致：`file`（必填）、`folder`、`siteId`（`route.ts` 只认这三个）
 * · 成功 → 清空 input + `router.refresh()`；失败 → 顶部 `p[role="alert"]` 显示服务端 `message`
 *   （含 413「文件超过 10MB」/ 415「只支持 JPEG / PNG / WebP / GIF」）
 * · `accept` 只是输入框提示，**真正的白名单在服务端**（客户端可绕过）
 */

/** 与 `/api/media/upload` 的 `ALLOWED_MIME_TYPES` 保持一致（不含 svg，理由见该文件注释） */
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

const ALERT_CLASS =
  "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive";

type UploadResponse =
  { ok: true; data: { id: string; name: string } } | { ok: false; code: string; message: string };

export function MediaUploader({
  siteId,
  canUpload,
}: {
  siteId?: string | null;
  /** `can(role, "media.upload")`（`editor` 有；`auditor` 无 `menu.media`，页面已 404） */
  canUpload: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];

    if (!file) {
      setError("请先选择文件。");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "other");
    // super_admin 才真正生效（其余角色在端点内锁 session.siteId，`route.ts`）
    if (siteId) {
      formData.append("siteId", siteId);
    }

    setError(null);
    setNotice(null);
    setPending(true);

    try {
      const response = await fetch("/api/media/upload", { method: "POST", body: formData });
      const payload = (await response.json()) as UploadResponse;

      if (!response.ok || !payload.ok) {
        setError(payload.ok ? "上传失败，请重试。" : payload.message);
        return;
      }

      if (inputRef.current) {
        inputRef.current.value = "";
      }
      setNotice(`已上传：${file.name}`);
      router.refresh();
    } catch {
      setError("网络异常，上传失败。");
    } finally {
      setPending(false);
    }
  }

  if (!canUpload) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-4">
      {error ? (
        <p role="alert" className={ALERT_CLASS}>
          {error}
        </p>
      ) : null}

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={ACCEPT}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
        />
        <Button type="button" size="sm" disabled={pending} onClick={() => void handleUpload()}>
          {pending ? "上传中…" : "上传"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        支持 JPEG / PNG / WebP / GIF，单文件 ≤ 10MB；上传后落到「用途：other」。
      </p>
    </div>
  );
}
