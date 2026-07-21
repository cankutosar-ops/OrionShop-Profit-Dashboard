import { cn } from "@/lib/utils";

type ChartLoadingStateProps = {
  height?: number | string;
  className?: string;
};

export function ChartLoadingState({
  height = 256,
  className,
}: ChartLoadingStateProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-control)] bg-muted/30",
        className
      )}
      style={{ height }}
      role="status"
      aria-label="Loading chart"
    />
  );
}
