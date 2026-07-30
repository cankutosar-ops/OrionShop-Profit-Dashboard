"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ReportEmptyState } from "@/components/reports/preview/report-empty-state";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortSpec } from "@/lib/ui/table-sort";

export type ReportTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null;
  cell: (row: T) => React.ReactNode;
  className?: string;
  /** Optional min width hint for dense portfolio tables */
  minWidth?: string;
};

type ReportTableProps<T> = {
  columns: ReportTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  compact?: boolean;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  maxRows?: number;
  /** Sticky thead while scrolling the table body area */
  stickyHeader?: boolean;
  className?: string;
  minWidthClassName?: string;
};

export function ReportTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = "No data for this period.",
  compact,
  defaultSortKey,
  defaultSortDir = "desc",
  maxRows,
  stickyHeader = true,
  className,
  minWidthClassName = "min-w-[640px]",
}: ReportTableProps<T>) {
  const defaultSort = useMemo<SortSpec<string> | null>(
    () =>
      defaultSortKey
        ? { key: defaultSortKey, direction: defaultSortDir }
        : null,
    [defaultSortKey, defaultSortDir]
  );

  const { sort, onSort, directionFor, isActive } = useCycleSort(defaultSort);

  const sorted = useMemo(() => {
    return sortRowsBySpec(rows, sort, (row, key) => {
      const col = columns.find((c) => c.key === key);
      return col?.sortValue?.(row) ?? null;
    });
  }, [columns, rows, sort]);

  const visible = maxRows != null ? sorted.slice(0, maxRows) : sorted;

  if (rows.length === 0) {
    return (
      <ReportEmptyState
        variant="no-data"
        label="No data"
        hint={emptyMessage}
      />
    );
  }

  const cellPad = compact ? "px-2.5 py-1.5" : "px-3 py-2.5";
  const headPad = compact ? "px-2.5 py-2" : "px-3 py-2.5";

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-border/60 print:overflow-visible print:rounded-none print:border-black/15",
        className
      )}
    >
      <table
        className={cn(
          "w-full border-collapse print:min-w-0",
          compact ? "text-xs" : "text-sm",
          minWidthClassName
        )}
      >
        <thead
          className={cn(
            stickyHeader &&
              "sticky top-0 z-10 print:static [&_th]:bg-card"
          )}
        >
          <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground print:border-black/20">
            {columns.map((col) => {
              const clickable = Boolean(col.sortable && col.sortValue);
              if (!clickable) {
                return (
                  <th
                    key={col.key}
                    style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                    className={cn(
                      "whitespace-nowrap font-medium",
                      headPad,
                      col.align === "right" ? "text-right" : "text-left",
                      col.className
                    )}
                  >
                    {col.header}
                  </th>
                );
              }
              return (
                <SortableTh
                  key={col.key}
                  label={col.header}
                  active={isActive(col.key)}
                  direction={directionFor(col.key)}
                  onClick={() => onSort(col.key)}
                  align={col.align === "right" ? "right" : "left"}
                  style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                  className={cn("whitespace-nowrap", headPad, col.className)}
                />
              );
            })}
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="border-b border-border/50 transition-colors last:border-0 hover:bg-muted/30 print:border-black/10 print:hover:bg-transparent"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "align-middle",
                    cellPad,
                    col.align === "right" && "text-right tabular-nums",
                    col.className
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {maxRows != null && sorted.length > maxRows ? (
        <p className="border-t border-border/50 px-3 py-2 text-xs text-muted-foreground print:hidden">
          Showing {maxRows} of {sorted.length} rows
        </p>
      ) : null}
    </div>
  );
}
