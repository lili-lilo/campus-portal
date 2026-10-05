#!/usr/bin/env node
/**
 * 生成 SQLite 轨 schema（M6-5 双轨）
 * ============================================================================
 * 背景：Prisma 的 `datasource.provider` **不能用环境变量**（官方从未支持）⇒ 要双轨
 * （本地 SQLite / 生产 PG）必须有**两份 schema**。为避免 500+ 行模型定义双份漂移，
 * 本脚本把 `prisma/schema.prisma` 复制一份、**只把 provider 换成 sqlite**，
 * 产出 `prisma/schema.sqlite.prisma`（进仓库，但**不要手改**）。
 *
 * 用法：
 *   node scripts/gen-sqlite-schema.mjs           # 生成/覆盖 schema.sqlite.prisma
 *   node scripts/gen-sqlite-schema.mjs --check   # 只校验是否同步（不同步则 exit 1，供 CI 用）
 *
 * 配合 `prisma.config.ts`：`DATABASE_URL` 以 `file:` 开头 ⇒ 用 sqlite 版，否则用 pg 版。
 * ⚠ 两轨共用同一个生成产物路径 `src/generated/prisma` ⇒ **切轨必须重跑 `prisma generate`**。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRISMA_DIR = join(HERE, "..", "prisma");
const SOURCE = join(PRISMA_DIR, "schema.prisma");
const TARGET = join(PRISMA_DIR, "schema.sqlite.prisma");

const PG_LINE = 'provider = "postgresql"';
const SQLITE_LINE = 'provider = "sqlite"';

const HEADER = [
  "// ⚠ 本文件由 scripts/gen-sqlite-schema.mjs 生成，**请勿手改**。",
  '// 与 prisma/schema.prisma 的唯一差异：datasource.provider = "sqlite"。',
  "// 改完 prisma/schema.prisma 后重跑：node scripts/gen-sqlite-schema.mjs",
  "",
].join("\n");

function build() {
  const text = readFileSync(SOURCE, "utf8");
  if (!text.includes(PG_LINE)) {
    throw new Error(`[gen-sqlite-schema] ${SOURCE} 里没有找到 ${PG_LINE}，请检查 schema`);
  }
  return HEADER + text.replace(PG_LINE, SQLITE_LINE);
}

const check = process.argv.includes("--check");
const expected = build();

let actual = "";
try {
  actual = readFileSync(TARGET, "utf8");
} catch {
  actual = "";
}

if (check) {
  if (actual !== expected) {
    console.error(
      "[gen-sqlite-schema] ✗ prisma/schema.sqlite.prisma 与 schema.prisma 不同步。\n" +
        "  修复：node scripts/gen-sqlite-schema.mjs",
    );
    process.exit(1);
  }
  console.log("[gen-sqlite-schema] ✔ 两份 schema 已同步（除 provider 行外逐字一致）");
} else {
  writeFileSync(TARGET, expected, "utf8");
  console.log(`[gen-sqlite-schema] ✔ 已写出 ${TARGET}（${expected.split("\n").length} 行）`);
}
