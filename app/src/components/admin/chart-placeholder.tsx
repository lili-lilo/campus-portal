import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * 图表占位容器（T3.2）—— Server Component
 *
 * T3.2 裁决 1：4 个图表容器全渲染，其中 1 个真图（`visit-trend-chart.tsx`）、3 个占位。
 * 占位**不 import `ui/chart.tsx`**（避免在未接线时把 recharts 拉进无关渲染路径）；
 * 真实数据留第 5 周（docs/16 M5 L313「Recharts 四个图表有数据」）。
 */
export function ChartPlaceholder({ title, hint }: { title: string; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground">
          数据待 M5 接入
        </div>
      </CardContent>
    </Card>
  );
}
