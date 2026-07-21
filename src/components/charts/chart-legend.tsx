import { cn } from "@/lib/utils";

export type ChartLegendItem = {
  label: string;
  color: string;
};

type ChartLegendProps = {
  items: ChartLegendItem[];
  className?: string;
  /** horizontal (default) | vertical list */
  orientation?: "horizontal" | "vertical";
};

/**
 * Canonical chart legend — marker size, typography, spacing.
 */
export function ChartLegend({
  items,
  className,
  orientation = "horizontal",
}: ChartLegendProps) {
  if (items.length === 0) return null;

  return (
    <ul
      className={cn(
        "flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground",
        orientation === "vertical" && "flex-col gap-y-2",
        className
      )}
      role="list"
    >
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
