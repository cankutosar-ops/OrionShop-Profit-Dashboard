"use client";

import { useCallback, useMemo } from "react";
import type { CategoryProfitability } from "@/types/database";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type CategoryProfitabilityTableProps = {
  categories: CategoryProfitability[];
  isSampleData?: boolean;
};

type SortKey =
  | "categoryName"
  | "productCount"
  | "revenue"
  | "netProfit"
  | "margin"
  | "returnRate";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function marginOf(category: CategoryProfitability): number | null {
  if (!(category.revenue > 0) || !Number.isFinite(category.revenue)) return null;
  const margin = (category.netProfit / category.revenue) * 100;
  return Number.isFinite(margin) ? margin : null;
}

function sortValue(row: CategoryProfitability, key: SortKey): SortValue {
  switch (key) {
    case "categoryName":
      return row.categoryName;
    case "productCount":
      return row.productCount;
    case "revenue":
      return row.revenue;
    case "netProfit":
      return row.netProfit;
    case "margin":
      return marginOf(row);
    case "returnRate":
      return row.returnRate;
  }
}

export function CategoryProfitabilityTable({
  categories,
  isSampleData,
}: CategoryProfitabilityTableProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: CategoryProfitability, key: SortKey) => sortValue(row, key),
    []
  );
  const sorted = useMemo(
    () => sortRowsBySpec(categories, sort, getValue),
    [categories, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Category Profitability</h3>
        <p className="text-sm text-muted-foreground">
          {categories.length} categories
          {isSampleData && " · sample data"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh
                label="Category"
                active={isActive("categoryName")}
                direction={directionFor("categoryName")}
                onClick={() => onSort("categoryName")}
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
                label="Net Profit"
                active={isActive("netProfit")}
                direction={directionFor("netProfit")}
                onClick={() => onSort("netProfit")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Margin"
                active={isActive("margin")}
                direction={directionFor("margin")}
                onClick={() => onSort("margin")}
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
                  No category data available for the selected period
                </td>
              </tr>
            ) : (
              sorted.map((category) => {
                const marginSafe = marginOf(category);

                return (
                  <tr
                    key={category.categoryId}
                    className="border-b border-border/50 transition-colors hover:bg-card-hover"
                  >
                    <td className="px-6 py-3.5 font-medium">{category.categoryName}</td>
                    <td className="px-6 py-3.5 text-right text-muted-foreground">
                      {category.productCount}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium">
                      {formatCurrency(category.revenue)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 text-right font-medium",
                        category.netProfit >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatCurrency(category.netProfit)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3.5 text-right",
                        marginSafe === null
                          ? "text-muted-foreground"
                          : marginSafe >= 0
                            ? "text-success"
                            : "text-danger"
                      )}
                    >
                      {marginSafe === null ? "—" : formatPercent(marginSafe)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-muted-foreground">
                      {formatPercent(category.returnRate)}
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
