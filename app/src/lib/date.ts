/**
 * 日期与时区 —— **纯函数**（docs/13 §5.1 R2：展示层只允许通过**一个**日期工具模块格式化）
 *
 * `dateKeyOf` 是 docs/13 §5.3 规定的 **唯一实现**：写入方（seed 的 90 天统计）
 * 与查询方（第 5 周的统计查询）**必须共用它**，不得任一处自行拼接日期字符串。
 *
 * ⚠ `prisma/seed.ts` 必须 import 本模块（不得再内联一份）。
 */

const SHANGHAI = "Asia/Shanghai";

/** `dateKey = YYYY-MM-DD`，按 Asia/Shanghai 计算（docs/13 §5.3 的唯一实现） */
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 列表页：`YYYY-MM-DD`（docs/13 §5.5） */
const listDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 详情页：`YYYY-MM-DD HH:mm` */
const detailDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 后台表格：`YYYY-MM-DD HH:mm:ss` */
const tableDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** en-CA 的输出形如 `2026-10-01`；把可能出现的逗号/空格归一为规范写法 */
function normalize(value: string): string {
  return value.replace(/,\s*/g, " ").trim();
}

/** docs/13 §5.3：`dateKey`（按 Asia/Shanghai，`YYYY-MM-DD`） */
export function dateKeyOf(utcDate: Date): string {
  return dateKeyFormatter.format(utcDate);
}

export function formatListDate(value: Date | null | undefined): string {
  return value ? normalize(listDateFormatter.format(value)) : "—";
}

export function formatDetailDate(value: Date | null | undefined): string {
  return value ? normalize(detailDateFormatter.format(value)) : "—";
}

export function formatTableDate(value: Date | null | undefined): string {
  return value ? normalize(tableDateFormatter.format(value)) : "—";
}
