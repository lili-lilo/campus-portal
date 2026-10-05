#!/usr/bin/env node
/**
 * 明德大学 · seed 图片批处理（Node 入口）
 * ===========================================================================
 * 实际处理逻辑在 `process-images.py`（Pillow）。之所以不是纯 Node：
 * 本仓**没有安装任何 node 图像库**（sharp / jimp / canvas / pngjs 均无），
 * 且 `docs/12` 冻结新增依赖 ⇒ 图像处理只能用 Python + Pillow 实现。
 * 本文件只做「参数透传 + 退出码透传」，方便沿用 node 的调用习惯：
 *
 *   node app/scripts/process-images.mjs --dry-run   # 只打印计划
 *   node app/scripts/process-images.mjs             # 真正落盘
 *
 * 前置：本机有 Python（`python` / `python3` / `py` 任一）+ Pillow。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pyScript = join(here, "process-images.py");

if (!existsSync(pyScript)) {
  console.error(`[ERR] 找不到 ${pyScript}`);
  process.exit(1);
}

const python = ["python", "python3", "py"].find(
  (cmd) => spawnSync(cmd, ["-c", "print(1)"], { stdio: "ignore" }).status === 0,
);

if (!python) {
  console.error("[ERR] 未找到 Python（本脚本的处理逻辑依赖 Pillow）");
  process.exit(1);
}

// stdio 用 inherit：受限沙箱下 piped stdio 会 EPERM，且这里本来就要直通输出
const res = spawnSync(python, [pyScript, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
});

process.exit(res.status ?? 1);
