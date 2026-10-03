"use client";

import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import type { VisitTrendPoint } from "@/app/admin/dashboard/actions";

/**
 * 访问趋势折线图（T3.2：**首次接线** `ui/chart.tsx` × recharts 3.8.0）
 * ============================================================================
 * 裁决约束（T3.2 裁决 5）：
 *   · **不用** `ChartLegend` / `ChartLegendContent` —— 封装层的水平对齐可能失效，
 *     且 `ui/chart.tsx` 属冻结区（一行都不改）；三条折线靠 tooltip 区分。
 *   · X 轴直接用 `dateKey`（`YYYY-MM-DD`，**不经** `formatListDate`；格式已符合展示要求）。
 *
 * recharts 3.8.0 写法约束（docs/12 §6.1 第 3 次记录 L320-L338）：本项目**不使用** `Legend`，
 * 故 L331/L334 的 `align`+`verticalAlign` ↔ `position`+`offset` 陷阱在此不触发。
 *
 * 颜色走 `ChartConfig.color` → `ChartStyle` 注入的 `--color-<key>`（chart.tsx L79-L106）：
 *   · `chart.tsx` L95-L96 把该值**原样**拼进 `<style>` 的 `--color-<key>: <value>;`
 *     ⇒ 只要是合法 CSS 颜色值（hex / oklch / hsl / rgb / var()）都行，封装层不做格式解析。
 *   · ⚠ **不要用 `globals.css` 的 `--chart-1..3`**：它们是 shadcn 原值且**无彩度**
 *     （globals.css L190-L192 = `oklch(0.87 0 0)` / `oklch(0.556 0 0)` / `oklch(0.439 0 0)`，
 *     chroma = 0），三条线只在明度上差一档 → 目视近乎"灰白色、无法区分"。
 *   · `globals.css` 属 T1.3 冻结区（禁改），故在此**显式写死**三色：蓝 / 绿 / 橙。
 */
const CHART_CONFIG = {
  pv: { label: "PV", color: "#1a4f8b" }, // 蓝（docs/08 主色）
  uv: { label: "UV", color: "#15803d" }, // 绿
  ip: { label: "IP", color: "#c2410c" }, // 橙
} satisfies ChartConfig;

export function VisitTrendChart({ data }: { data: readonly VisitTrendPoint[] }) {
  return (
    <ChartContainer config={CHART_CONFIG} className="h-64 w-full">
      {/* recharts 的 data 需要可变数组 → 解构复制一份 */}
      <LineChart data={[...data]} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="dateKey" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />

        <ChartTooltip content={<ChartTooltipContent />} />

        <Line
          dataKey="pv"
          name="PV"
          type="monotone"
          stroke="var(--color-pv)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="uv"
          name="UV"
          type="monotone"
          stroke="var(--color-uv)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          dataKey="ip"
          name="IP"
          type="monotone"
          stroke="var(--color-ip)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
