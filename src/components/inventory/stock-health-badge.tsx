import type { StockHealthStatus } from "@/lib/inventory-intelligence-types";
import { cn } from "@/lib/utils";

const styles: Record<StockHealthStatus, string> = {
  Healthy: "bg-success/10 text-success",
  Slow: "bg-warning/10 text-amber-600 dark:text-amber-400",
  "At Risk": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "Dead Stock": "bg-danger/10 text-danger",
};

/** Colored badge for Stock Health — value comes from the intelligence service only. */
export function StockHealthBadge({ status }: { status: StockHealthStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}
