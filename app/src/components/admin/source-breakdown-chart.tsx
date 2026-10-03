"use client";

import { Cell, Pie, PieChart } from "recharts";

import type { SourceBreakdownItem } from "@/app/admin/statistics/actions";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

/**
 * 来源分布饼图（M5-3a）—— Server Component 传数据、本组件只画图
 * ============================================================================
 * 裁决与坑（沿用 `visit-trend-chart.tsx` 的 T3.2 口径）：
 *   · **不用 `ChartLegend`** —— recharts 3.8 用 `align`/`verticalAlign`、3.10 改 `position`/`offset`，
 *     写错**不报错、只是位置不对**（`docs/12` §6.1 第 3 次记录 L331/L334/L337 + R10）；
 *     切片含义靠 tooltip 与图例色块（下方自绘小图例）表达。
 *   · **颜色显式写 hex** —— `globals.css` 的 `--chart-1..3` 是 `oklch(… 0 0)` 无彩度，
 *     直接用它会出现"多片同色/灰白"（T3.2 实测，见 `visit-trend-chart.tsx` L28-L31）。
 *   · `Pie` 多片必须逐片 `<Cell fill>`，否则全部同色。
 *   · `ui/chart.tsx` 属冻结区：只 import 容器/提示框，不改它。
 */

/** 三值 + 兜底色（第 4 色留给将来新增来源） */
const COLORS: Record<string, string> = {
  search: "#1a4f8b", // 蓝（docs/08 主色）
  direct: "#15803d", // 绿
  external: "#c2410c", // 橙（第 3 色）
  unknown: "#7c3aed", // 紫（兜底）
};

const CHART_CONFIG = {
  search: { label: "搜索", color: COLORS.search },
  direct: { label: "直接访问", color: COLORS.direct },
  external: { label: "外部链接", color: COLORS.external },
  unknown: { label: "其它", color: COLORS.unknown },
} satisfies ChartConfig;

function colorOf(source: string): string {
  return COLORS[source] ?? COLORS.unknown;
}

function labelOf(source: string): string {
  return CHART_CONFIG[source as keyof typeof CHART_CONFIG]?.label ?? source;
}

export function SourceBreakdownChart({ data }: { data: readonly SourceBreakdownItem[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无来源数据。</p>;
  }

  // 给每片一个稳定的 name（`ChartTooltipContent` 通过 ChartConfig.label 显示中文）
  const chartData = data.map((item) => ({
    source: item.source,
    label: labelOf(item.source),
    pv: item.pv,
  }));

  return (
    <div className="space-y-2">
      <ChartContainer config={CHART_CONFIG} className="h-56 w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="source" />} />
          <Pie data={chartData} dataKey="pv" nameKey="source" innerRadius={48} outerRadius={84}>
            {chartData.map((item) => (
              <Cell key={item.source} fill={colorOf(item.source)} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* 小图例：色块 + 中文名 + PV（替代被否决的 ChartLegend） */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {chartData.map((item) => (
          <li key={item.source} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: colorOf(item.source) }}
            />
            <span>{item.label}</span>
            <span className="text-foreground">{item.pv}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
