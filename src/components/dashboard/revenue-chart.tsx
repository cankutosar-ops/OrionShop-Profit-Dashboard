"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartEmptyState } from "@/components/charts/chart-empty-state";
import { ChartLegend } from "@/components/charts/chart-legend";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useChartPalette } from "@/hooks/use-chart-palette";
import {
  CHART_ANIMATION_MS,
  CHART_AXIS,
  CHART_GRID,
  CHART_MARGIN,
  CHART_STROKE_WIDTH,
  chartAreaFill,
} from "@/lib/chart-theme";
import { formatDate } from "@/lib/utils";

type RevenueChartProps = {
  data: { date: string; revenue: number; profit: number }[];
};

function RevenueTooltip({
  active,
  payload,
  label,
  colors,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
  colors: { revenue: string; profit: string };
}) {
  if (!active || !payload?.length) return null;

  return (
    <ChartTooltip
      active
      label={label ? formatDate(label) : undefined}
      items={payload.map((entry) => ({
        label: entry.dataKey === "revenue" ? "Sales" : "Profit",
        value: entry.value,
        format: "currency" as const,
        color: entry.dataKey === "revenue" ? colors.revenue : colors.profit,
      }))}
    />
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  const palette = useChartPalette();
  const revenueColor = palette.series.primary;
  const profitColor = palette.series.positive;

  if (!data.length) {
    return <ChartEmptyState height={300} />;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={CHART_MARGIN.default}>
          <defs>
            <linearGradient id="chartRevenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartAreaFill(0, 0.22)} stopOpacity={1} />
              <stop offset="100%" stopColor={chartAreaFill(0, 0)} stopOpacity={1} />
            </linearGradient>
            <linearGradient id="chartProfitFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartAreaFill(2, 0.22)} stopOpacity={1} />
              <stop offset="100%" stopColor={chartAreaFill(2, 0)} stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray={CHART_GRID.strokeDasharray}
            stroke={palette.grid}
            vertical={CHART_GRID.vertical}
            strokeOpacity={0.55}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) =>
              new Date(v).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
            }
            stroke={palette.axis}
            fontSize={CHART_AXIS.fontSize}
            tickLine={CHART_AXIS.tickLine}
            axisLine={CHART_AXIS.axisLine}
            tick={{ fill: palette.axis }}
          />
          <YAxis
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            stroke={palette.axis}
            fontSize={CHART_AXIS.fontSize}
            tickLine={CHART_AXIS.tickLine}
            axisLine={CHART_AXIS.axisLine}
            width={50}
            tick={{ fill: palette.axis }}
          />
          <Tooltip
            content={
              <RevenueTooltip colors={{ revenue: revenueColor, profit: profitColor }} />
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={revenueColor}
            strokeWidth={CHART_STROKE_WIDTH}
            fill="url(#chartRevenueFill)"
            animationDuration={CHART_ANIMATION_MS}
          />
          <Area
            type="monotone"
            dataKey="profit"
            stroke={profitColor}
            strokeWidth={CHART_STROKE_WIDTH}
            fill="url(#chartProfitFill)"
            animationDuration={CHART_ANIMATION_MS}
          />
        </AreaChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-4"
        items={[
          { label: "Sales", color: revenueColor },
          { label: "Gross Profit (daily)", color: profitColor },
        ]}
      />
    </div>
  );
}
