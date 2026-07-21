import { cn } from "@/lib/utils";

type ChartEmptyStateProps = {
  message?: string;
  height?: number | string;
  className?: string;
};

export function ChartEmptyState({
  message = "No data for selected period",
  height = 300,
  className,
}: ChartEmptyStateProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center text-sm text-muted-foreground",
        className
      )}
      style={{ height }}
      role="status"
    >
      {message}
    </div>
  );
}
