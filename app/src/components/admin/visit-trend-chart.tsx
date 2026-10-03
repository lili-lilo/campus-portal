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
 * 颜色走 `ChartConfig.color` → `ChartStyle` 注入的 `--color-<key>`（chart.tsx L79-L106），
 * 取值用 `globals.css` 既有的 `--chart-1..3`（L190-L194），**不改 globals.css**。
 */
const CHART_CONFIG = {
  pv: { label: "PV", color: "var(--chart-1)" },
  uv: { label: "UV", color: "var(--chart-2)" },
  ip: { label: "IP", color: "var(--chart-3)" },
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
