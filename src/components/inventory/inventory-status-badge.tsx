import type { InventoryDisplayStatus } from "@/lib/inventory-types";
import { cn } from "@/lib/utils";

const styles: Record<InventoryDisplayStatus, string> = {
  "Out of Stock": "bg-danger/10 text-danger",
  "Low Stock": "bg-warning/10 text-amber-600 dark:text-amber-400",
  Healthy: "bg-success/10 text-success",
};

export function InventoryStatusBadge({ status }: { status: InventoryDisplayStatus }) {
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

export function formatDaysLeft(daysLeft: number | null): string {
  if (daysLeft === null) return "—";
  if (daysLeft <= 0) return "0 d";
  if (daysLeft >= 365) return "365+ d";
  return `${Math.round(daysLeft)} d`;
}
