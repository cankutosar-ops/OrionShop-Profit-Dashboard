"use client";

import { useCallback, useMemo } from "react";
import type { ProductAnalyticsRow } from "@/types/database";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductAnalyticsTableProps = {
  title: string;
  description?: string;
  rows: ProductAnalyticsRow[];
  compact?: boolean;
};

type SortKey =
  | "article"
  | "product"
  | "revenue"
  | "qty"
  | "productCost"
  | "fees"
  | "netProfit"
  | "margin";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function profitVariant(value: number): "success" | "danger" {
  return value >= 0 ? "success" : "danger";
}

function sortValue(row: ProductAnalyticsRow, key: SortKey): SortValue {
  switch (key) {
    case "article":
      return row.supplierArticle;
    case "product":
      return row.productName;
    case "revenue":
      return row.revenue;
    case "qty":
      return row.quantitySold;
    case "productCost":
      return row.productCost;
    case "fees":
      return row.marketplaceFees;
    case "netProfit":
      return row.netProfit;
    case "margin":
      return row.marginPercent;
  }
}

export function ProductAnalyticsTable({
  title,
  description,
  rows,
  compact = false,
}: ProductAnalyticsTableProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: ProductAnalyticsRow, key: SortKey) => sortValue(row, key),
    []
  );
  const sorted = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh
                label="Article"
                active={isActive("article")}
                direction={directionFor("article")}
                onClick={() => onSort("article")}
                className="px-6 py-3"
              />
              {!compact && (
                <SortableTh
                  label="Product"
                  active={isActive("product")}
                  direction={directionFor("product")}
                  onClick={() => onSort("product")}
                  className="px-6 py-3"
                />
              )}
              <SortableTh
                label="Revenue"
                active={isActive("revenue")}
                direction={directionFor("revenue")}
                onClick={() => onSort("revenue")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Qty Sold"
                active={isActive("qty")}
                direction={directionFor("qty")}
                onClick={() => onSort("qty")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Product Cost"
                active={isActive("productCost")}
                direction={directionFor("productCost")}
                onClick={() => onSort("productCost")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Marketplace Fees"
                active={isActive("fees")}
                direction={directionFor("fees")}
                onClick={() => onSort("fees")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Net Profit"
                active={isActive("netProfit")}
                direction={directionFor("netProfit")}
                onClick={() => onSort("netProfit")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Margin %"
                active={isActive("margin")}
                direction={directionFor("margin")}
                onClick={() => onSort("margin")}
                align="right"
                className="px-6 py-3"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={compact ? 7 : 8}
                  className="px-6 py-12 text-center text-muted-foreground"
                >
                  No product data for the selected period
                </td>
              </tr>
            ) : (
              sorted.map((row) => (
                <tr
                  key={row.productId}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td
                    className="px-6 py-3.5 font-mono text-xs font-medium text-primary"
                    title={row.productName}
                  >
                    {row.supplierArticle}
                  </td>
                  {!compact && (
                    <td className="max-w-[220px] truncate px-6 py-3.5" title={row.productName}>
                      {row.productName}
                    </td>
                  )}
                  <td className="px-6 py-3.5 text-right font-medium tabular-nums">
                    {formatCurrency(row.revenue)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatNumber(row.quantitySold)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatCurrency(row.productCost)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatCurrency(row.marketplaceFees)}
                  </td>
                  <td
                    className={cn(
                      "px-6 py-3.5 text-right font-medium tabular-nums",
                      profitVariant(row.netProfit)
                    )}
                  >
                    {formatCurrency(row.netProfit)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatPercent(row.marginPercent)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
