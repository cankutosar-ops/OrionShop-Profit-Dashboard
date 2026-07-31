"use client";

import { ReportTable, type ReportTableColumn } from "@/components/reports/preview/report-table";

export type { ReportTableColumn };

/**
 * Shared reporting table — reuses the existing report table primitive.
 */
export function ReportDataTable<T>(props: {
  columns: ReportTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyMessage?: string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  compact?: boolean;
  minWidthClassName?: string;
}) {
  return (
    <ReportTable
      columns={props.columns}
      rows={props.rows}
      rowKey={props.rowKey}
      emptyMessage={props.emptyMessage}
      defaultSortKey={props.defaultSortKey}
      defaultSortDir={props.defaultSortDir}
      compact={props.compact}
      minWidthClassName={props.minWidthClassName}
      stickyHeader
    />
  );
}
