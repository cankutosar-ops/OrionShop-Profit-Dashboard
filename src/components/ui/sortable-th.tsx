"use client";

import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { sortIndicator, type SortDirection } from "@/lib/ui/table-sort";

type SortableThProps = {
  label: ReactNode;
  active: boolean;
  direction: SortDirection | null;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
  style?: CSSProperties;
  /** Show a muted ↕ hint on inactive sortable headers */
  showInactiveHint?: boolean;
};

/**
 * Universal sortable column header — DESC → ASC → default cycle via parent.
 */
export function SortableTh({
  label,
  active,
  direction,
  onClick,
  align = "left",
  className,
  style,
  showInactiveHint = true,
}: SortableThProps) {
  const indicator = active ? sortIndicator(direction) : showInactiveHint ? "↕" : "";

  return (
    <th
      style={style}
      className={cn(
        "font-medium",
        align === "right" ? "text-right" : "text-left",
        className
      )}
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex max-w-full items-center gap-1 select-none rounded-md hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span className="truncate">{label}</span>
        {indicator ? (
          <span
            aria-hidden
            className={cn(
              "shrink-0 text-[10px] leading-none",
              active ? "opacity-80" : "opacity-35"
            )}
          >
            {indicator}
          </span>
        ) : null}
      </button>
    </th>
  );
}
