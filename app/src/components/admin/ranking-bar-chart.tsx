"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * 排行榜横向条图（M5-3a）—— **一个组件两用**：文章排行 / 栏目排行
 * ============================================================================
 * 输入已归一为 `{ label, value }`（调用方把 `title/viewCount` 或 `name/count` 映射进来）。
 *
 * 坑与裁决（沿用 T3.2 口径）：
 *   · **`layout="vertical"` 时必须交换轴类型**：`XAxis type="number"` + `YAxis type="category"`。
 *     写反（都用默认）会**不显示条、且不报错**（同类"静默失效"）。
 *   · **不用 `ChartLegend`**（recharts 3.8/3.10 的 `align` ↔ `position` 差异，写错静默失效；
 *     `docs/12` §6.1 第 3 次记录 L331/L334/L337）。单序列图也不需要图例。
 *   · **颜色显式写 hex**（`--chart-*` 无彩度，见 `visit-trend-chart.tsx` L28-L31）。
 *   · `YAxis` 的类目标签可能很长（文章标题）⇒ 固定宽度 + `tickFormatter` 截断。
 */

/** 标签最大显示长度（超出截断加省略号；完整值仍可在 tooltip 里看到） */
const LABEL_MAX = 15;

function truncateLabel(value: string): string {
  return value.length > LABEL_MAX ? `${value.slice(0, LABEL_MAX)}…` : value;
}

export function RankingBarChart({
  data,
  barColor = "#1a4f8b",
  valueLabel = "数值",
  emptyText = "暂无排行数据。",
}: {
  data: readonly { label: string; value: number }[];
  /** 显式色（默认主色蓝；调用方可给第 2 色以区分两个排行榜） */
  barColor?: string;
  /** tooltip 里显示的中文名（如"浏览量"/"文章数"） */
  valueLabel?: string;
  emptyText?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  const chartConfig = { value: { label: valueLabel, color: barColor } } satisfies ChartConfig;

  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart
        data={[...data]}
        layout="vertical"
        margin={{ left: 4, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(value: string) => truncateLabel(value)}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="value" name={valueLabel} fill={barColor} radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
