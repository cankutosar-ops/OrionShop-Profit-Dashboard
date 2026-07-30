"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
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
 *
 * Uses a fixed square PieChart (not ResponsiveContainer) so the ring never
 * clips against a flex parent and center labels stay aligned with the hole.
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

  // Fixed square; small edge pad keeps sectors inside the SVG viewBox.
  const ringSize = Math.max(160, Math.min(height, 240));
  const edgePad = 6;
  const outer = Math.floor(ringSize / 2 - edgePad);
  const inner = Math.floor(outer * 0.62);
  const holeMax = Math.max(48, Math.floor(inner * 1.55));

  const sideLegend = legendPlacement === "side";

  const ring = (
    <div
      className={cn("relative shrink-0", !sideLegend && "mx-auto")}
      style={{ width: ringSize, height: ringSize }}
    >
      <PieChart width={ringSize} height={ringSize}>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx={ringSize / 2}
          cy={ringSize / 2}
          innerRadius={inner}
          outerRadius={outer}
          paddingAngle={2}
          stroke="transparent"
          isAnimationActive={false}
          animationDuration={CHART_ANIMATION_MS}
        >
          {slices.map((entry) => (
            <Cell key={entry.name} fill={entry.fill} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip content={<DonutTooltip valueFormat={valueFormat} />} />
      </PieChart>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="px-1 text-center" style={{ maxWidth: holeMax }}>
          <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {centerLabel}
          </p>
          <p
            className={cn(
              "mt-0.5 font-semibold leading-tight tabular-nums text-foreground",
              centerValue.length > 10 ? "text-xs" : "text-sm"
            )}
          >
            {centerValue}
          </p>
        </div>
      </div>
    </div>
  );

  const legend =
    showLegend ? (
      sideLegend ? (
        <ul className="w-fit max-w-full shrink-0 space-y-2" role="list">
          {slices.map((item) => (
            <li key={item.name} className="flex items-center gap-3 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.fill }}
                aria-hidden
              />
              <span className="max-w-[12rem] truncate text-muted-foreground">
                {item.name}
              </span>
              <span className="font-medium tabular-nums">
                {formatChartValue(item.value, valueFormat)}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {total > 0 ? `${Math.round((item.value / total) * 100)}%` : "0%"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ChartLegend items={legendItems} className="justify-center" />
      )
    ) : null;

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-4",
        sideLegend && "sm:flex-row sm:items-center sm:justify-start sm:gap-6",
        className
      )}
    >
      {ring}
      {legend}
    </div>
  );
}
