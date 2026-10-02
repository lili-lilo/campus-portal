import { describe, expect, it } from "vitest";

import { dateKeyOf, formatDetailDate, formatListDate, formatTableDate } from "@/lib/date";

/**
 * 时区单测（docs/16 §2.5 + docs/13 §5.3）
 *
 * 关键边界：UTC `2026-09-30T23:00:00Z` 在 Asia/Shanghai（UTC+8）是 `2026-10-01 07:00`
 * → `dateKey` 必须返回 **2026-10-01**（不能按 UTC 算成 09-30）。
 */
describe("date：dateKey 按 Asia/Shanghai（docs/13 §5.3）", () => {
  it("文档样例：UTC 2026-09-30T23:00:00Z → 2026-10-01", () => {
    expect(dateKeyOf(new Date("2026-09-30T23:00:00Z"))).toBe("2026-10-01");
  });

  it("Shanghai 跨日边界：15:59:59Z 仍是 09-30，16:00:00Z 已是 10-01", () => {
    expect(dateKeyOf(new Date("2026-09-30T15:59:59Z"))).toBe("2026-09-30");
    expect(dateKeyOf(new Date("2026-09-30T16:00:00Z"))).toBe("2026-10-01");
  });

  it("基准时间 2026-10-01T00:00:00Z（seed 的 BASE）→ 2026-10-01", () => {
    expect(dateKeyOf(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
  });

  it("格式恒为 YYYY-MM-DD（en-CA）", () => {
    expect(dateKeyOf(new Date("2026-01-05T03:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateKeyOf(new Date("2026-01-05T03:00:00Z"))).toBe("2026-01-05");
  });
});

describe("date：展示格式（docs/13 §5.5）", () => {
  it("列表页 YYYY-MM-DD", () => {
    expect(formatListDate(new Date("2026-10-01T10:30:05Z"))).toBe("2026-10-01");
  });

  it("详情页 YYYY-MM-DD HH:mm（按 Shanghai = UTC+8）", () => {
    expect(formatDetailDate(new Date("2026-10-01T10:30:05Z"))).toBe("2026-10-01 18:30");
  });

  it("后台表格 YYYY-MM-DD HH:mm:ss", () => {
    expect(formatTableDate(new Date("2026-10-01T10:30:05Z"))).toBe("2026-10-01 18:30:05");
  });

  it("空值统一回落 `—`", () => {
    expect(formatListDate(null)).toBe("—");
    expect(formatDetailDate(undefined)).toBe("—");
    expect(formatTableDate(null)).toBe("—");
  });
});
