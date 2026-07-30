"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartEmptyState } from "@/components/charts/chart-empty-state";
import { ChartTooltip, formatChartValue } from "@/components/charts/chart-tooltip";
import { useChartPalette } from "@/hooks/use-chart-palette";
import { CHART_ANIMATION_MS, CHART_AXIS, CHART_GRID, CHART_MARGIN } from "@/lib/chart-theme";

type BrandContributionChartProps = {
  data: Array<{ brand: string; netProfit: number; revenue: number }>;
  height?: number;
};

/**
 * Brand net-profit comparison — presentation of ReportDocument brand rows.
 */
export function BrandContributionChart({
  data,
  height = 240,
}: BrandContributionChartProps) {
  const palette = useChartPalette();
  const rows = data.slice(0, 8);

  if (rows.length === 0) {
    return <ChartEmptyState message="No brand profit data" height={height} />;
  }

  const barColor = palette.series.primary;
  const revenueColor = palette.series.secondary;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ ...CHART_MARGIN, left: 8 }}>
          <CartesianGrid
            strokeDasharray={CHART_GRID.strokeDasharray}
            stroke={palette.grid}
            horizontal={false}
          />
          <XAxis
            type="number"
            tick={{ fill: palette.axis, fontSize: CHART_AXIS.fontSize }}
            tickFormatter={(v: number) => formatChartValue(v, "currency")}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="brand"
            width={96}
            tick={{ fill: palette.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as {
                brand: string;
                netProfit: number;
                revenue: number;
              };
              return (
                <ChartTooltip
                  active
                  label={row.brand}
                  items={[
                    {
                      label: "Net Profit",
                      value: row.netProfit,
                      format: "currency",
                      color: barColor,
                    },
                    {
                      label: "Revenue",
                      value: row.revenue,
                      format: "currency",
                      color: revenueColor,
                    },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="netProfit"
            name="Net Profit"
            fill={barColor}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            animationDuration={CHART_ANIMATION_MS}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
