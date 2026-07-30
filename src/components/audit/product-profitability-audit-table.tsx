"use client";

import { useCallback, useMemo } from "react";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import type { ProductProfitabilityAuditRow } from "@/types/database";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductProfitabilityAuditTableProps = {
  rows: ProductProfitabilityAuditRow[];
  totals: ProductProfitabilityAuditRow;
};

type AuditSortKey =
  | "supplierArticle"
  | "productName"
  | "revenue"
  | "quantitySold"
  | "commission"
  | "logistics"
  | "returnLogistics"
  | "deductions"
  | "productCost"
  | "grossProfit"
  | "netProfit"
  | "marginPercent";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function auditSortValue(row: ProductProfitabilityAuditRow, key: AuditSortKey): SortValue {
  switch (key) {
    case "supplierArticle":
      return row.supplierArticle;
    case "productName":
      return row.productName;
    case "revenue":
      return row.revenue;
    case "quantitySold":
      return row.quantitySold;
    case "commission":
      return row.commission;
    case "logistics":
      return row.logistics;
    case "returnLogistics":
      return row.returnLogistics;
    case "deductions":
      return row.deductions;
    case "productCost":
      return row.productCost;
    case "grossProfit":
      return row.grossProfit;
    case "netProfit":
      return row.netProfit;
    case "marginPercent":
      return row.marginPercent;
  }
}

function AuditCell({
  value,
  className,
  variant,
}: {
  value: string;
  className?: string;
  variant?: "default" | "success" | "danger" | "muted";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-right tabular-nums",
        variant === "success" && "text-success",
        variant === "danger" && "text-danger",
        variant === "muted" && "text-muted-foreground",
        className
      )}
    >
      {value}
    </td>
  );
}

function profitVariant(value: number): "success" | "danger" {
  return value >= 0 ? "success" : "danger";
}

export function ProductProfitabilityAuditTable({
  rows,
  totals,
}: ProductProfitabilityAuditTableProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<AuditSortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: ProductProfitabilityAuditRow, key: AuditSortKey) => auditSortValue(row, key),
    []
  );
  const sortedRows = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Top {rows.length} by revenue</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Grouped by product_id · wb_finance fees allocated per product
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh
                label="Article"
                active={isActive("supplierArticle")}
                direction={directionFor("supplierArticle")}
                onClick={() => onSort("supplierArticle")}
                className="sticky left-0 z-10 bg-card px-4 py-3 font-medium"
              />
              <SortableTh
                label="Product"
                active={isActive("productName")}
                direction={directionFor("productName")}
                onClick={() => onSort("productName")}
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Revenue"
                active={isActive("revenue")}
                direction={directionFor("revenue")}
                onClick={() => onSort("revenue")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Qty Sold"
                active={isActive("quantitySold")}
                direction={directionFor("quantitySold")}
                onClick={() => onSort("quantitySold")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Commission"
                active={isActive("commission")}
                direction={directionFor("commission")}
                onClick={() => onSort("commission")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Logistics"
                active={isActive("logistics")}
                direction={directionFor("logistics")}
                onClick={() => onSort("logistics")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Return Log."
                active={isActive("returnLogistics")}
                direction={directionFor("returnLogistics")}
                onClick={() => onSort("returnLogistics")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Deductions"
                active={isActive("deductions")}
                direction={directionFor("deductions")}
                onClick={() => onSort("deductions")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Product Cost"
                active={isActive("productCost")}
                direction={directionFor("productCost")}
                onClick={() => onSort("productCost")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Gross Profit"
                active={isActive("grossProfit")}
                direction={directionFor("grossProfit")}
                onClick={() => onSort("grossProfit")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Net Profit"
                active={isActive("netProfit")}
                direction={directionFor("netProfit")}
                onClick={() => onSort("netProfit")}
                align="right"
                className="px-4 py-3 font-medium"
              />
              <SortableTh
                label="Margin %"
                active={isActive("marginPercent")}
                direction={directionFor("marginPercent")}
                onClick={() => onSort("marginPercent")}
                align="right"
                className="px-4 py-3 font-medium"
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-muted-foreground">
                  No product sales in the selected period
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.productId}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td className="sticky left-0 z-10 bg-card px-4 py-3 font-mono text-xs font-medium text-primary">
                    {row.supplierArticle}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3" title={row.productName}>
                    {row.productName}
                  </td>
                  <AuditCell value={formatCurrency(row.revenue)} className="font-medium" />
                  <AuditCell value={formatNumber(row.quantitySold)} variant="muted" />
                  <AuditCell value={formatCurrency(row.commission)} variant="muted" />
                  <AuditCell value={formatCurrency(row.logistics)} variant="muted" />
                  <AuditCell value={formatCurrency(row.returnLogistics)} variant="muted" />
                  <AuditCell value={formatCurrency(row.deductions)} variant="muted" />
                  <AuditCell value={formatCurrency(row.productCost)} variant="muted" />
                  <AuditCell
                    value={formatCurrency(row.grossProfit)}
                    variant={profitVariant(row.grossProfit)}
                  />
                  <AuditCell
                    value={formatCurrency(row.netProfit)}
                    variant={profitVariant(row.netProfit)}
                    className="font-medium"
                  />
                  <AuditCell value={formatPercent(row.marginPercent)} variant="muted" />
                </tr>
              ))
            )}
            {rows.length > 0 && (
              <tr className="border-t border-border bg-primary/5 font-semibold">
                <td className="sticky left-0 z-10 bg-primary/5 px-4 py-3" colSpan={2}>
                  {totals.productName}
                </td>
                <AuditCell value={formatCurrency(totals.revenue)} />
                <AuditCell value={formatNumber(totals.quantitySold)} />
                <AuditCell value={formatCurrency(totals.commission)} />
                <AuditCell value={formatCurrency(totals.logistics)} />
                <AuditCell value={formatCurrency(totals.returnLogistics)} />
                <AuditCell value={formatCurrency(totals.deductions)} />
                <AuditCell value={formatCurrency(totals.productCost)} />
                <AuditCell
                  value={formatCurrency(totals.grossProfit)}
                  variant={profitVariant(totals.grossProfit)}
                />
                <AuditCell
                  value={formatCurrency(totals.netProfit)}
                  variant={profitVariant(totals.netProfit)}
                />
                <AuditCell value={formatPercent(totals.marginPercent)} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
