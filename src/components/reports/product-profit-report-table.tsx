"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type { ProductProfitReportRow } from "@/lib/reporting/product-profit-report-types";

type ProductProfitReportTableProps = {
  rows: ProductProfitReportRow[];
};

type SortColumn =
  | "sku"
  | "model"
  | "brand"
  | "revenue"
  | "orders"
  | "purchases"
  | "marketplaceFee"
  | "logistics"
  | "advertising"
  | "productCost"
  | "netProfit"
  | "marginPercent";

const DEFAULT_SORT = { key: "netProfit" as const, direction: "desc" as const };

type ColumnDef = {
  key: SortColumn;
  label: string;
  align?: "left" | "right";
  value: (row: ProductProfitReportRow) => SortValue;
  render: (row: ProductProfitReportRow) => ReactNode;
};

const columns: ColumnDef[] = [
  {
    key: "sku",
    label: "SKU",
    value: (row) => row.sku,
    render: (row) => <span className="font-mono text-xs">{row.sku}</span>,
  },
  {
    key: "model",
    label: "Model",
    value: (row) => row.model,
    render: (row) => <span className="font-medium">{row.model}</span>,
  },
  {
    key: "brand",
    label: "Brand",
    value: (row) => row.brand,
    render: (row) => row.brand,
  },
  {
    key: "revenue",
    label: "Revenue",
    align: "right",
    value: (row) => row.revenue,
    render: (row) => formatCurrency(row.revenue),
  },
  {
    key: "orders",
    label: "Orders",
    align: "right",
    value: (row) => row.orders,
    render: (row) => formatNumber(row.orders),
  },
  {
    key: "purchases",
    label: "Purchases",
    align: "right",
    value: (row) => row.purchases,
    render: (row) => formatNumber(row.purchases),
  },
  {
    key: "marketplaceFee",
    label: "Marketplace Fee",
    align: "right",
    value: (row) => row.marketplaceFee,
    render: (row) => formatCurrency(row.marketplaceFee),
  },
  {
    key: "logistics",
    label: "Logistics",
    align: "right",
    value: (row) => row.logistics,
    render: (row) => formatCurrency(row.logistics),
  },
  {
    key: "advertising",
    label: "Advertising",
    align: "right",
    value: (row) => row.advertising,
    render: (row) => formatCurrency(row.advertising),
  },
  {
    key: "productCost",
    label: "Product Cost",
    align: "right",
    value: (row) => row.productCost,
    render: (row) => formatCurrency(row.productCost),
  },
  {
    key: "netProfit",
    label: "Net Profit",
    align: "right",
    value: (row) => row.netProfit,
    render: (row) => formatCurrency(row.netProfit),
  },
  {
    key: "marginPercent",
    label: "Margin %",
    align: "right",
    value: (row) => row.marginPercent,
    render: (row) => formatPercent(row.marginPercent),
  },
];

function columnValue(row: ProductProfitReportRow, key: SortColumn): SortValue {
  const column = columns.find((item) => item.key === key);
  return column ? column.value(row) : null;
}

export function ProductProfitReportTable({ rows }: ProductProfitReportTableProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortColumn>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: ProductProfitReportRow, key: SortColumn) => columnValue(row, key),
    []
  );

  const sortedRows = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              {columns.map((column) => (
                <SortableTh
                  key={column.key}
                  label={column.label}
                  active={isActive(column.key)}
                  direction={directionFor(column.key)}
                  onClick={() => onSort(column.key)}
                  align={column.align === "right" ? "right" : "left"}
                  className={cn(
                    "sticky top-0 z-10 bg-card px-3 py-2.5 text-xs font-semibold uppercase tracking-wide"
                  )}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                  No product profitability rows for the selected scope.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.productId} className="border-b border-border/50 last:border-b-0">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2 tabular-nums",
                        column.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
