import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  buildMetricTrend,
  type MetricTrendDisplay,
  type MetricTrendInput,
} from "@/lib/kpi-format";

export type MetricCardTrend = MetricTrendInput;

type MetricCardProps = {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  icon: LucideIcon;
  /**
   * Optional comparison trend. Omit entirely when no comparison data exists.
   * Never pass invented values.
   */
  trend?: MetricCardTrend | null;
  variant?: "default" | "success" | "warning" | "danger" | "muted";
  /** Override icon gradient (Model B commercial palette). */
  iconClassName?: string;
  /** Optional value color override (presentation only). */
  valueClassName?: string;
  hint?: string;
  /** Card wrapper classes (e.g. Net Profit emphasis). */
  className?: string;
  /**
   * default — standard dashboard KPI
   * hero — primary emphasis
   * compact — dense module grids / strips (same language, tighter spacing)
   */
  size?: "default" | "hero" | "compact";
};

const variantIconStyles = {
  default: "from-primary/20 to-primary/5 text-primary",
  success: "from-success/20 to-success/5 text-success",
  warning: "from-warning/20 to-warning/5 text-warning",
  danger: "from-danger/20 to-danger/5 text-danger",
  muted: "from-muted/40 to-muted/10 text-muted-foreground",
};

const variantValueStyles = {
  default: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
};

function TrendLine({ trend }: { trend: MetricTrendDisplay }) {
  return (
    <p
      className={cn(
        "text-xs font-medium tabular-nums",
        trend.direction === "up" && "text-success",
        trend.direction === "down" && "text-danger",
        trend.direction === "stable" && "text-muted-foreground"
      )}
    >
      <span aria-hidden>{trend.symbol}</span>{" "}
      {trend.direction === "stable"
        ? "stable"
        : `${trend.value > 0 ? "+" : ""}${trend.value}%`}{" "}
      <span className="font-normal text-muted-foreground">{trend.label}</span>
    </p>
  );
}

/**
 * Canonical KPI presentation for WB Dashboard.
 * All modules should reuse this language.
 */
export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  iconClassName,
  valueClassName,
  className,
  size = "default",
  hint,
}: MetricCardProps) {
  const compact = size === "compact";
  const trendDisplay = trend ? buildMetricTrend(trend) : null;

  return (
    <div
      title={hint}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden border border-border bg-card transition-ui hover:border-primary/30 hover:bg-card-hover",
        "rounded-[var(--radius-card)]",
        compact ? "p-3" : "p-5",
        className
      )}
    >
      <div className="flex flex-1 items-start justify-between gap-3">
        <div className={cn("min-w-0 flex-1", compact ? "space-y-1" : "space-y-2")}>
          <p className={cn("text-kpi-label", compact && "text-xs")}>{title}</p>
          <div
            className={cn(
              "text-kpi-value",
              size === "hero" && "text-3xl leading-none",
              size === "default" && "text-2xl",
              size === "compact" && "text-lg leading-tight",
              variantValueStyles[variant],
              valueClassName
            )}
          >
            {value}
          </div>
          {subtitle ? (
            <div className="text-secondary-label min-h-[1.25rem] text-muted">{subtitle}</div>
          ) : (
            <div className="min-h-[1.25rem]" aria-hidden />
          )}
          {trendDisplay ? <TrendLine trend={trendDisplay} /> : null}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center justify-center bg-gradient-to-br",
            "rounded-[var(--radius-control)]",
            compact ? "h-8 w-8" : "h-11 w-11",
            iconClassName ?? variantIconStyles[variant]
          )}
        >
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
      </div>
    </div>
  );
}
