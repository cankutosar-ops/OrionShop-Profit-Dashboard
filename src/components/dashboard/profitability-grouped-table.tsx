"use client";

import { useState } from "react";
import {
  groupedNetMarginPercent,
  type ProfitabilityDimension,
} from "@/lib/dimension-profitability";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { GroupedProfitability } from "@/types/database";

type ProfitabilityGroupedTableProps = {
  categories: GroupedProfitability[];
  brands: GroupedProfitability[];
  isSampleData?: boolean;
  /** Initial group-by tab. */
  defaultDimension?: ProfitabilityDimension;
};

const DIMENSION_LABEL: Record<ProfitabilityDimension, string> = {
  category: "Category",
  brand: "Brand",
};

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
              <th className="px-6 py-3 font-medium">{nameHeader}</th>
              <th className="px-6 py-3 text-right font-medium">Products</th>
              <th className="px-6 py-3 text-right font-medium">Revenue</th>
              <th className="px-6 py-3 text-right font-medium">Final Net Profit</th>
              <th className="px-6 py-3 text-right font-medium">Net Margin</th>
              <th className="px-6 py-3 text-right font-medium">Return Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  No {nameHeader.toLowerCase()} data available for the selected period
                </td>
              </tr>
            ) : (
              rows.map((row) => {
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
                        margin >= 0 ? "text-success" : "text-danger"
                      )}
                    >
                      {formatPercent(margin)}
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
