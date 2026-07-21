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
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useChartPalette } from "@/hooks/use-chart-palette";
import {
  CHART_ANIMATION_MS,
  CHART_AXIS,
  CHART_BAR_RADIUS,
  CHART_GRID,
  CHART_MARGIN,
} from "@/lib/chart-theme";

type BarChartData = {
  label: string;
  value: number;
  secondary?: number;
};

type ValueFormat = "currency" | "percent";

type ProfitBarChartProps = {
  data: BarChartData[];
  valueLabel?: string;
  secondaryLabel?: string;
  /** Chart token index 0–5 (preferred over hardcoded hex). */
  colorIndex?: number;
  secondaryColorIndex?: number;
  /** @deprecated Prefer colorIndex — ignored when colorIndex is set. */
  color?: string;
  /** @deprecated Prefer secondaryColorIndex. */
  secondaryColor?: string;
  valueFormat?: ValueFormat;
};

function BarTooltip({
  active,
  payload,
  label,
  valueLabel,
  secondaryLabel,
  valueFormat,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string; fill: string }[];
  label?: string;
  valueLabel: string;
  secondaryLabel?: string;
  valueFormat: ValueFormat;
}) {
  if (!active || !payload?.length) return null;

  return (
    <ChartTooltip
      active
      label={label}
      items={payload.map((entry) => ({
        label: entry.dataKey === "value" ? valueLabel : (secondaryLabel ?? "Secondary"),
        value: entry.value,
        format: valueFormat,
        color: entry.fill,
      }))}
    />
  );
}

export function ProfitBarChart({
  data,
  valueLabel = "Profit",
  secondaryLabel,
  colorIndex = 0,
  secondaryColorIndex = 2,
  color,
  secondaryColor,
  valueFormat = "currency",
}: ProfitBarChartProps) {
  const palette = useChartPalette();
  const primaryFill = color ?? palette.color(colorIndex);
  const secondaryFill = secondaryColor ?? palette.color(secondaryColorIndex);

  if (!data.length) {
    return <ChartEmptyState height={320} />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={CHART_MARGIN.withAngledLabels}>
        <CartesianGrid
          strokeDasharray={CHART_GRID.strokeDasharray}
          stroke={palette.grid}
          vertical={CHART_GRID.vertical}
          strokeOpacity={0.55}
        />
        <XAxis
          dataKey="label"
          stroke={palette.axis}
          fontSize={11}
          tickLine={CHART_AXIS.tickLine}
          axisLine={CHART_AXIS.axisLine}
          angle={-35}
          textAnchor="end"
          interval={0}
          height={60}
          tick={{ fill: palette.axis }}
        />
        <YAxis
          tickFormatter={(v) =>
            valueFormat === "percent" ? `${v}%` : `${(v / 1000).toFixed(0)}k`
          }
          stroke={palette.axis}
          fontSize={CHART_AXIS.fontSize}
          tickLine={CHART_AXIS.tickLine}
          axisLine={CHART_AXIS.axisLine}
          width={50}
          tick={{ fill: palette.axis }}
        />
        <Tooltip
          content={
            <BarTooltip
              valueLabel={valueLabel}
              secondaryLabel={secondaryLabel}
              valueFormat={valueFormat}
            />
          }
        />
        <Bar
          dataKey="value"
          fill={primaryFill}
          radius={CHART_BAR_RADIUS}
          maxBarSize={48}
          animationDuration={CHART_ANIMATION_MS}
        />
        {secondaryLabel ? (
          <Bar
            dataKey="secondary"
            fill={secondaryFill}
            radius={CHART_BAR_RADIUS}
            maxBarSize={48}
            animationDuration={CHART_ANIMATION_MS}
          />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}
