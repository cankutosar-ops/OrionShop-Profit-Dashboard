"use client";

import { useCallback, useMemo } from "react";
import type { ProductAnalyticsV3Row } from "@/types/database";
import { LogisticsBreakdownHint } from "@/components/analytics/logistics-breakdown-hint";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { getOperationalMarginBand } from "@/lib/product-operational-metrics";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductAnalyticsV3TableProps = {
  title: string;
  description?: string;
  rows: ProductAnalyticsV3Row[];
  /** full = All Products (product column, dense full-width); compact = ranked top/bottom lists */
  layout?: "full" | "compact";
};

type SortKey =
  | "sku"
  | "product"
  | "orders"
  | "purchases"
  | "conversion"
  | "revenue"
  | "commission"
  | "logistics"
  | "productCost"
  | "operProfit"
  | "operMargin";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function operationalVariant(marginPercent: number): "success" | "warning" | "danger" | "muted" {
  const band = getOperationalMarginBand(marginPercent);
  if (band === "strong") return "success";
  if (band === "healthy") return "muted";
  if (band === "weak") return "warning";
  return "danger";
}

function sortValue(row: ProductAnalyticsV3Row, key: SortKey): SortValue {
  switch (key) {
    case "sku":
      return row.supplierArticle;
    case "product":
      return row.productName;
    case "orders":
      return row.orders;
    case "purchases":
      return row.purchases;
    case "conversion":
      return row.conversionPercent;
    case "revenue":
      return row.revenue;
    case "commission":
      return row.commission;
    case "logistics":
      return row.totalLogistics;
    case "productCost":
      return row.productCost;
    case "operProfit":
      return row.operationalProfit;
    case "operMargin":
      return row.operationalMarginPercent;
  }
}

const stickySkuHeader =
  "sticky left-0 z-20 min-w-[6.5rem] bg-card border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]";
const stickySkuCell =
  "sticky left-0 z-20 min-w-[6.5rem] bg-card group-hover:bg-card-hover border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]";

export function ProductAnalyticsV3Table({
  title,
  description,
  rows,
  layout = "compact",
}: ProductAnalyticsV3TableProps) {
  const isFull = layout === "full";
  const colSpan = isFull ? 11 : 10;
  const cellPad = isFull ? "px-3 py-2" : "px-4 py-2.5";
  const headPad = isFull ? "px-3 py-2" : "px-4 py-2.5";

  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: ProductAnalyticsV3Row, key: SortKey) => sortValue(row, key),
    []
  );
  const sorted = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className={cn("border-b border-border", isFull ? "px-4 py-2.5" : "px-4 py-3")}>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", isFull && "min-w-full table-fixed", !isFull && "min-w-[840px]")}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortableTh
                label="SKU"
                active={isActive("sku")}
                direction={directionFor("sku")}
                onClick={() => onSort("sku")}
                className={cn(headPad, stickySkuHeader)}
              />
              {isFull && (
                <SortableTh
                  label="Product"
                  active={isActive("product")}
                  direction={directionFor("product")}
                  onClick={() => onSort("product")}
                  className={cn(headPad, "w-[16%]")}
                />
              )}
              <SortableTh
                label="Orders"
                active={isActive("orders")}
                direction={directionFor("orders")}
                onClick={() => onSort("orders")}
                align="right"
                className={cn(headPad, "w-[7%]")}
              />
              <SortableTh
                label="Buyout"
                active={isActive("purchases")}
                direction={directionFor("purchases")}
                onClick={() => onSort("purchases")}
                align="right"
                className={cn(headPad, "w-[7%]")}
              />
              <SortableTh
                label="Conv. %"
                active={isActive("conversion")}
                direction={directionFor("conversion")}
                onClick={() => onSort("conversion")}
                align="right"
                className={cn(headPad, "w-[7%]")}
              />
              <SortableTh
                label="Revenue"
                active={isActive("revenue")}
                direction={directionFor("revenue")}
                onClick={() => onSort("revenue")}
                align="right"
                className={cn(headPad, "w-[9%]")}
              />
              <SortableTh
                label="Commission"
                active={isActive("commission")}
                direction={directionFor("commission")}
                onClick={() => onSort("commission")}
                align="right"
                className={cn(headPad, "w-[9%]")}
              />
              <SortableTh
                label="Total Logistics"
                active={isActive("logistics")}
                direction={directionFor("logistics")}
                onClick={() => onSort("logistics")}
                align="right"
                className={cn(headPad, "w-[9%]")}
              />
              <SortableTh
                label="Product Cost"
                active={isActive("productCost")}
                direction={directionFor("productCost")}
                onClick={() => onSort("productCost")}
                align="right"
                className={cn(headPad, "w-[9%]")}
              />
              <SortableTh
                label="Oper. Profit"
                active={isActive("operProfit")}
                direction={directionFor("operProfit")}
                onClick={() => onSort("operProfit")}
                align="right"
                className={cn(headPad, "w-[9%]")}
              />
              <SortableTh
                label="Oper. Margin"
                active={isActive("operMargin")}
                direction={directionFor("operMargin")}
                onClick={() => onSort("operMargin")}
                align="right"
                className={cn(headPad, "w-[6%]")}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No product data for the selected period
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const variant = operationalVariant(row.operationalMarginPercent);
                return (
                  <tr
                    key={row.productId}
                    className="group border-b border-border/50 transition-colors hover:bg-card-hover"
                  >
                    <td
                      className={cn(
                        cellPad,
                        "font-mono text-xs font-medium text-primary",
                        !isFull && "whitespace-nowrap",
                        stickySkuCell
                      )}
                      title={row.productName}
                    >
                      {row.supplierArticle}
                    </td>
                    {isFull && (
                      <td className={cn(cellPad, "truncate")} title={row.productName}>
                        {row.productName}
                      </td>
                    )}
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatNumber(row.orders)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatNumber(row.purchases)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatPercent(row.conversionPercent)}
                    </td>
                    <td className={cn(cellPad, "text-right font-medium tabular-nums")}>
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatCurrency(row.commission)}
                    </td>
                    <td className={cn(cellPad, "text-right tabular-nums text-muted-foreground")}>
                      <LogisticsBreakdownHint
                        totalLogistics={row.totalLogistics}
                        purchaseLogistics={row.purchaseLogistics}
                        excludedLogistics={row.excludedLogistics}
                        returnLogistics={row.returnLogistics}
                      />
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatCurrency(row.productCost)}
                    </td>
                    <td
                      className={cn(
                        cellPad,
                        "text-right font-medium tabular-nums",
                        variant === "success" && "text-success",
                        variant === "danger" && "text-danger",
                        variant === "warning" && "text-amber-500"
                      )}
                    >
                      {formatCurrency(row.operationalProfit)}
                    </td>
                    <td
                      className={cn(
                        cellPad,
                        "text-right tabular-nums",
                        variant === "success" && "text-success",
                        variant === "danger" && "text-danger",
                        variant === "warning" && "text-amber-500",
                        variant === "muted" && "text-muted-foreground"
                      )}
                    >
                      {formatPercent(row.operationalMarginPercent)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
