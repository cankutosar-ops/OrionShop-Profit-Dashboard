"use client";

import { DonutChart } from "@/components/charts/donut-chart";
import { formatChartValue } from "@/components/charts/chart-tooltip";

type CostBreakdownChartProps = {
  data: { name: string; value: number; color?: string }[];
};

export function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <DonutChart
      data={data}
      centerLabel="Total costs"
      centerValue={formatChartValue(total, "currency")}
      valueFormat="currency"
      height={220}
      emptyMessage="No cost data available"
      legendPlacement="side"
    />
  );
}
