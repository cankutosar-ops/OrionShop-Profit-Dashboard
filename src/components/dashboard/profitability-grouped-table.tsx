"use client";

import { useCallback, useMemo, useState } from "react";
import {
  groupedNetMarginPercent,
  type ProfitabilityDimension,
} from "@/lib/dimension-profitability";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { GroupedProfitability } from "@/types/database";

type ProfitabilityGroupedTableProps = {
  categories: GroupedProfitability[];
  brands: GroupedProfitability[];
  isSampleData?: boolean;
  /** Initial group-by tab. */
  defaultDimension?: ProfitabilityDimension;
};

type SortKey =
  | "name"
  | "productCount"
  | "revenue"
  | "finalNetProfit"
  | "netMargin"
  | "returnRate";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

const DIMENSION_LABEL: Record<ProfitabilityDimension, string> = {
  category: "Category",
  brand: "Brand",
};

function sortValue(row: GroupedProfitability, key: SortKey): SortValue {
  switch (key) {
    case "name":
      return row.name;
    case "productCount":
      return row.productCount;
    case "revenue":
      return row.revenue;
    case "finalNetProfit":
      return row.finalNetProfit;
    case "netMargin":
      return groupedNetMarginPercent(row);
    case "returnRate":
      return row.returnRate;
  }
}

/**
 * Reusable Model B profitability rollup — Category / Brand (future: Supplier, …).
 * Financial values are pre-computed Model B outputs; only the grouping changes.
 */
export function ProfitabilityGroupedTable({
  categories,
  brands,
  isSampleData,
  defaultDimension = "category",
}: ProfitabilityGroupedTableProps) {
  const [dimension, setDimension] = useState<ProfitabilityDimension>(defaultDimension);
  const rows = dimension === "brand" ? brands : categories;
  const nameHeader = DIMENSION_LABEL[dimension];

  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: GroupedProfitability, key: SortKey) => sortValue(row, key),
    []
  );
  const sorted = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Profitability</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} groups
            {isSampleData && " · sample data"}
            {" · Model B"}
          </p>
        </div>
        <div
          className="inline-flex rounded-lg border border-border bg-background p-0.5"
          role="group"
          aria-label="Group profitability by"
        >
          {(["category", "brand"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDimension(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                dimension === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              aria-pressed={dimension === key}
            >
              {DIMENSION_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh
                label={nameHeader}
                active={isActive("name")}
                direction={directionFor("name")}
                onClick={() => onSort("name")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Products"
                active={isActive("productCount")}
                direction={directionFor("productCount")}
                onClick={() => onSort("productCount")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Revenue"
                active={isActive("revenue")}
                direction={directionFor("revenue")}
                onClick={() => onSort("revenue")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Final Net Profit"
                active={isActive("finalNetProfit")}
                direction={directionFor("finalNetProfit")}
                onClick={() => onSort("finalNetProfit")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Net Margin"
                active={isActive("netMargin")}
                direction={directionFor("netMargin")}
                onClick={() => onSort("netMargin")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Return Rate"
                active={isActive("returnRate")}
                direction={directionFor("returnRate")}
                onClick={() => onSort("returnRate")}
                align="right"
                className="px-6 py-3"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  No {nameHeader.toLowerCase()} data available for the selected period
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const margin = groupedNetMarginPercent(row);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/50 transition-colors hover:bg-card-hover"
                  >
                    <td className="px-6 py-3.5 font-medium">{row.name}</td>
                    <td className="px-6 py-3.5 text-right text-muted-foreground">
                      {row.productCount}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 text-right font-medium",
                        row.finalNetProfit >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatCurrency(row.finalNetProfit)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 text-right",
                        margin === null
                          ? "text-muted-foreground"
                          : margin >= 0
                            ? "text-success"
                            : "text-danger"
                      )}
                    >
                      {margin === null ? "—" : formatPercent(margin)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-muted-foreground">
                      {formatPercent(row.returnRate)}
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
