"use client";

import type { ReactNode } from "react";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { cn } from "@/lib/utils";

export type ChartValueFormat = "currency" | "percent" | "integer" | "decimal" | "raw";

export function formatChartValue(
  value: number,
  format: ChartValueFormat = "raw",
  options?: { decimals?: number; currency?: string }
): string {
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "currency":
      return formatKpiCurrency(value, options?.currency);
    case "percent":
      return formatKpiPercent(value, options?.decimals ?? 1);
    case "integer":
      return formatKpiCount(Math.round(value));
    case "decimal":
      return value.toLocaleString("ru-RU", {
        minimumFractionDigits: options?.decimals ?? 1,
        maximumFractionDigits: options?.decimals ?? 2,
      });
    default:
      return String(value);
  }
}

export type ChartTooltipItem = {
  label: string;
  value: number | string;
  format?: ChartValueFormat;
  color?: string;
  decimals?: number;
};

type ChartTooltipProps = {
  active?: boolean;
  /** Header line (date, category, etc.). */
  label?: ReactNode;
  items?: ChartTooltipItem[];
  className?: string;
  children?: ReactNode;
};

/**
 * Canonical chart tooltip shell — identical language across every chart.
 */
export function ChartTooltip({
  active,
  label,
  items,
  className,
  children,
}: ChartTooltipProps) {
  if (!active) return null;
  if (!children && (!items || items.length === 0)) return null;

  return (
    <div
      className={cn(
        "min-w-[9rem] rounded-[var(--radius-control)] border border-border bg-card px-3 py-2.5",
        "shadow-[var(--shadow-elevated)]",
        className
      )}
    >
      {label != null && label !== "" ? (
        <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      ) : null}
      {children}
      {items?.map((item) => {
        const display =
          typeof item.value === "number"
            ? formatChartValue(item.value, item.format ?? "raw", {
                decimals: item.decimals,
              })
            : item.value;
        return (
          <p
            key={item.label}
            className="text-sm font-medium tabular-nums text-foreground"
            style={item.color ? { color: item.color } : undefined}
          >
            <span className="text-muted-foreground">{item.label}: </span>
            {display}
          </p>
        );
      })}
    </div>
  );
}
