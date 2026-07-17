import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type MetricCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: "default" | "success" | "warning" | "danger";
  /** Override icon gradient (Model B commercial palette). */
  iconClassName?: string;
  hint?: string;
  /** Card wrapper classes (e.g. Net Profit emphasis). */
  className?: string;
  /** Enlarge value typography (~25% for primary KPI). */
  size?: "default" | "hero";
};

const variantStyles = {
  default: "from-primary/20 to-primary/5 text-primary",
  success: "from-success/20 to-success/5 text-success",
  warning: "from-warning/20 to-warning/5 text-warning",
  danger: "from-danger/20 to-danger/5 text-danger",
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  variant = "default",
  iconClassName,
  className,
  size = "default",
  hint,
}: MetricCardProps) {
  return (
    <div
      title={hint}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card-hover",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p
            className={cn(
              "font-bold tracking-tight",
              size === "hero" ? "text-3xl leading-none" : "text-2xl"
            )}
          >
            {value}
          </p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          {trend && (
            <p
              className={cn(
                "text-xs font-medium",
                trend.value >= 0 ? "text-success" : "text-danger"
              )}
            >
              {trend.value >= 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br",
            iconClassName ?? variantStyles[variant]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
