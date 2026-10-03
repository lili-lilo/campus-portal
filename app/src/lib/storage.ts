import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 存储抽象（T3.6a / `docs/11` A33 L233-L236）
 * ============================================================================
 * A33 原文：**双实现、单接口** —— `LocalStorageAdapter`（开发写 `public/uploads/`，
 * `.gitignore` 排除）与 `SupabaseStorageAdapter`（生产走 Supabase Storage bucket）；
 * 理由是"不早抽接口，第 6 周部署时媒体上传会直接 500（Vercel 文件系统只读）"。
 *
 * 本批只落 **local**；`getStorage("supabase")` 显式 `throw`，把生产实现钉在第 6 周。
 * **零新依赖**：`node:fs/promises` + `node:crypto`（不引 `sharp`/`mime`）——
 * 因此 `Media.width` / `Media.height` 本地实现**留空**（`docs/13` 该两列为可空）。
 */

/** `Media.folder` 枚举（`docs/13` / `schema.prisma` L273-L274：news / carousel / dept / leader / other） */
export const MEDIA_FOLDERS = ["news", "carousel", "dept", "leader", "other"] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export type PutInput = {
  buffer: Buffer;
  /** 原始文件名（用于派生安全文件名；落库时另存 `Media.name`） */
  originalName: string;
  folder: MediaFolder;
  mimeType: string;
};

export type PutResult = {
  /** 站点根相对路径（本地即 `public/` 下的路径，可直接当 URL） */
  path: string;
  url: string;
};

export interface StorageAdapter {
  put(input: PutInput): Promise<PutResult>;
  delete(publicPath: string): Promise<void>;
  getUrl(publicPath: string): string;
}

/** 本地落点：`app/public/uploads/`（A33；已加进 `app/.gitignore`） */
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/**
 * 文件名净化：只保留 `[a-zA-Z0-9._-]`，其余替换为 `_`；
 * 先取 `basename` 以消除 `../` 等路径穿越，再限长 120 字符。
 */
export function sanitizeFileName(name: string): string {
  const base = path.basename(name);
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^[.]+/, "_");
  return cleaned.slice(-120) || "file";
}

export class LocalStorageAdapter implements StorageAdapter {
  async put({ buffer, originalName, folder }: PutInput): Promise<PutResult> {
    const now = new Date();
    // 按月分目录，避免单目录文件过多：`uploads/<folder>/<yyyyMM>/`
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const dir = path.join(UPLOAD_ROOT, folder, stamp);

    await mkdir(dir, { recursive: true });

    // `Media.path` 无唯一约束（schema.prisma L267）⇒ 用 uuid 前缀保证不撞
    const fileName = `${randomUUID()}-${sanitizeFileName(originalName)}`;
    await writeFile(path.join(dir, fileName), buffer);

    const publicPath = `/uploads/${folder}/${stamp}/${fileName}`;
    return { path: publicPath, url: publicPath };
  }

  async delete(publicPath: string): Promise<void> {
    const relative = publicPath.replace(/^\/+/, "");
    const target = path.resolve(UPLOAD_ROOT, relative);

    // 只允许删自己目录内的文件：越界（`..` / 绝对路径）静默忽略
    if (!target.startsWith(UPLOAD_ROOT + path.sep)) {
      return;
    }

    try {
      await unlink(target);
    } catch (error) {
      // 文件已不在（重复删除 / 手工清理）不算错
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  getUrl(publicPath: string): string {
    // 本地：`public/` 下的相对路径本身就是可访问 URL（Next 静态服务）
    return publicPath;
  }
}

/**
 * 存储驱动工厂：`STORAGE_DRIVER=local`（默认）→ `LocalStorageAdapter`；
 * `supabase` → 第 6 周实现（A33），现在显式报错以免"静默不落盘"。
 */
export function getStorage(
  driver: string | undefined = process.env.STORAGE_DRIVER,
): StorageAdapter {
  const resolved = driver ?? "local";

  if (resolved === "local") {
    return new LocalStorageAdapter();
  }

  if (resolved === "supabase") {
    throw new Error("SupabaseStorageAdapter 未实现（第 6 周，见 docs/11 A33）");
  }

  throw new Error(`未知的 STORAGE_DRIVER：${resolved}`);
}
