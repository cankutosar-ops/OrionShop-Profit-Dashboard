import type { HealthLevel, OverallHealthLabel } from "@/lib/production-health/types";
import { cn } from "@/lib/utils";

export function healthTone(status: HealthLevel | OverallHealthLabel | "PASS" | "FAIL" | "UNKNOWN") {
  const key = String(status).toLowerCase();
  if (key === "healthy" || key === "pass" || key === "success") {
    return "text-emerald-700 dark:text-emerald-400";
  }
  if (key === "warning" || key === "needs attention" || key === "partial") {
    return "text-amber-700 dark:text-amber-400";
  }
  if (key === "critical" || key === "fail" || key === "failed") {
    return "text-danger";
  }
  return "text-muted-foreground";
}

export function HealthBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border border-border/60 bg-background px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        healthTone(status as HealthLevel),
        className
      )}
    >
      {status}
    </span>
  );
}
