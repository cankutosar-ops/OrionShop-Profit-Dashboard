"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartEmptyState } from "@/components/charts/chart-empty-state";
import { ChartLegend } from "@/components/charts/chart-legend";
import { ChartTooltip, formatChartValue, type ChartValueFormat } from "@/components/charts/chart-tooltip";
import { chartColor, CHART_ANIMATION_MS } from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

export type DonutSlice = {
  name: string;
  value: number;
  /** Optional explicit color; otherwise assigned from chart tokens. */
  color?: string;
};

type DonutChartProps = {
  data: DonutSlice[];
  /** Primary metric shown in the donut center. */
  centerLabel: string;
  centerValue: string;
  valueFormat?: ChartValueFormat;
  height?: number;
  className?: string;
  emptyMessage?: string;
  showLegend?: boolean;
  /** Legend beside (default) or below the ring. */
  legendPlacement?: "side" | "below";
};

type TipProps = {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: DonutSlice & { fill: string } }>;
  valueFormat: ChartValueFormat;
};

function DonutTooltip({ active, payload, valueFormat }: TipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <ChartTooltip
      active
      items={[
        {
          label: item.name,
          value: item.value,
          format: valueFormat,
          color: item.payload.fill,
        },
      ]}
    />
  );
}

/**
 * Canonical donut — token colors, shared tooltip/legend, center primary metric.
 * Presentation only: callers supply already-computed slices.
 */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
  valueFormat = "currency",
  height = 220,
  className,
  emptyMessage = "No data available",
  showLegend = true,
  legendPlacement = "side",
}: DonutChartProps) {
  const slices = data
    .filter((d) => d.value > 0)
    .map((d, i) => ({
      ...d,
      fill: d.color ?? chartColor(i),
    }));

  if (slices.length === 0) {
    return <ChartEmptyState message={emptyMessage} height={height} />;
  }

  const legendItems = slices.map((s) => ({ label: s.name, color: s.fill }));
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const ring = (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="transparent"
            animationDuration={CHART_ANIMATION_MS}
          >
            {slices.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip valueFormat={valueFormat} />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {centerLabel}
        </p>
        <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground sm:text-lg">
          {centerValue}
        </p>
      </div>
    </div>
  );

  const legend =
    showLegend ? (
      <div className={cn(legendPlacement === "side" && "flex-1 space-y-2")}>
        {legendPlacement === "side" ? (
          <ul className="space-y-2" role="list">
            {slices.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: item.fill }}
                    aria-hidden
                  />
                  <span className="truncate text-muted-foreground">{item.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-medium tabular-nums">
                    {formatChartValue(item.value, valueFormat)}
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                    {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "0%"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <ChartLegend items={legendItems} className="justify-center" />
        )}
      </div>
    ) : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        legendPlacement === "side" && "lg:flex-row lg:items-center",
        className
      )}
    >
      {ring}
      {legend}
    </div>
  );
}
