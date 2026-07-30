"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
  CHART_BAR_RADIUS,
  CHART_GRID,
  CHART_MARGIN,
  CHART_STROKE_WIDTH,
} from "@/lib/chart-theme";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { DailyOrdersPurchasesPoint } from "@/types/database";

type OrdersPurchasesChartProps = {
  data: DailyOrdersPurchasesPoint[];
};

function OrdersPurchasesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: DailyOrdersPurchasesPoint }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <ChartTooltip active label={label ? formatDate(label) : undefined}>
      <p className="text-sm font-medium tabular-nums text-foreground">
        <span className="text-muted-foreground">Orders: </span>
        {formatNumber(point.ordersCount)} · {formatCurrency(point.ordersAmount)}
      </p>
      <p className="text-sm font-medium tabular-nums text-foreground">
        <span className="text-muted-foreground">Buyout: </span>
        {formatNumber(point.purchasesCount)} · {formatCurrency(point.purchasesAmount)}
      </p>
    </ChartTooltip>
  );
}

export function OrdersPurchasesChart({ data }: OrdersPurchasesChartProps) {
  const palette = useChartPalette();

  if (!data.length) {
    return <ChartEmptyState height={300} />;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={CHART_MARGIN.default}>
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
            yAxisId="count"
            tickFormatter={(v) => formatNumber(v)}
            stroke={palette.axis}
            fontSize={CHART_AXIS.fontSize}
            tickLine={CHART_AXIS.tickLine}
            axisLine={CHART_AXIS.axisLine}
            width={40}
            tick={{ fill: palette.axis }}
          />
          <YAxis
            yAxisId="amount"
            orientation="right"
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            stroke={palette.axis}
            fontSize={CHART_AXIS.fontSize}
            tickLine={CHART_AXIS.tickLine}
            axisLine={CHART_AXIS.axisLine}
            width={50}
            tick={{ fill: palette.axis }}
          />
          <Tooltip content={<OrdersPurchasesTooltip />} />
          <Bar
            yAxisId="count"
            dataKey="ordersCount"
            fill={palette.series.primary}
            radius={CHART_BAR_RADIUS}
            barSize={12}
            animationDuration={CHART_ANIMATION_MS}
          />
          <Bar
            yAxisId="count"
            dataKey="purchasesCount"
            fill={palette.series.positive}
            radius={CHART_BAR_RADIUS}
            barSize={12}
            animationDuration={CHART_ANIMATION_MS}
          />
          <Line
            yAxisId="amount"
            type="monotone"
            dataKey="ordersAmount"
            stroke={palette.series.secondary}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={false}
            animationDuration={CHART_ANIMATION_MS}
          />
          <Line
            yAxisId="amount"
            type="monotone"
            dataKey="purchasesAmount"
            stroke={palette.series.info}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={false}
            animationDuration={CHART_ANIMATION_MS}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <ChartLegend
        className="mt-4"
        items={[
          { label: "Orders (qty)", color: palette.series.primary },
          { label: "Buyout (qty)", color: palette.series.positive },
          { label: "Orders (₽)", color: palette.series.secondary },
          { label: "Buyout (₽)", color: palette.series.info },
        ]}
      />
    </div>
  );
}
