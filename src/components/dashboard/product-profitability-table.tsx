"use client";

import { useCallback, useMemo } from "react";
import type { ProductProfitability } from "@/types/database";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type ProductProfitabilityTableProps = {
  products: ProductProfitability[];
  isSampleData?: boolean;
};

type SortKey =
  | "modelCode"
  | "productName"
  | "categoryName"
  | "revenue"
  | "netProfit"
  | "marketplaceFees"
  | "advertising"
  | "returnRate";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function sortValue(row: ProductProfitability, key: SortKey): SortValue {
  switch (key) {
    case "modelCode":
      return row.modelCode;
    case "productName":
      return row.productName;
    case "categoryName":
      return row.categoryName;
    case "revenue":
      return row.revenue;
    case "netProfit":
      return row.finalNetProfit;
    case "marketplaceFees":
      return row.marketplaceFees;
    case "advertising":
      return row.advertising;
    case "returnRate":
      return row.returnRate;
  }
}

export function ProductProfitabilityTable({
  products,
  isSampleData,
}: ProductProfitabilityTableProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: ProductProfitability, key: SortKey) => sortValue(row, key),
    []
  );
  const sorted = useMemo(
    () => sortRowsBySpec(products, sort, getValue),
    [products, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Product Profitability</h3>
        <p className="text-sm text-muted-foreground">
          By supplier article (артикул) · {products.length} products
          {isSampleData && " · sample data"}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh
                label="Supplier Article"
                active={isActive("modelCode")}
                direction={directionFor("modelCode")}
                onClick={() => onSort("modelCode")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Product"
                active={isActive("productName")}
                direction={directionFor("productName")}
                onClick={() => onSort("productName")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Category"
                active={isActive("categoryName")}
                direction={directionFor("categoryName")}
                onClick={() => onSort("categoryName")}
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
                label="Marketplace Fees"
                active={isActive("marketplaceFees")}
                direction={directionFor("marketplaceFees")}
                onClick={() => onSort("marketplaceFees")}
                align="right"
                className="px-6 py-3"
              />
              <SortableTh
                label="Ad Cost"
                active={isActive("advertising")}
                direction={directionFor("advertising")}
                onClick={() => onSort("advertising")}
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
                <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                  No product data available for the selected period
                </td>
              </tr>
            ) : (
              sorted.map((product) => (
                <tr
                  key={product.productId}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td className="px-6 py-3.5 font-mono text-xs font-medium text-primary">
                    {product.modelCode}
                  </td>
                  <td className="px-6 py-3.5">{product.productName}</td>
                  <td className="px-6 py-3.5 text-muted-foreground">{product.categoryName}</td>
                  <td className="px-6 py-3.5 text-right font-medium">
                    {formatCurrency(product.revenue)}
                  </td>
                  <td
                    className={cn(
                      "px-6 py-3.5 text-right font-medium",
                      product.finalNetProfit >= 0 ? "text-success" : "text-danger"
                    )}
                  >
                    {formatCurrency(product.finalNetProfit)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground">
                    {formatCurrency(product.marketplaceFees)}
                  </td>
                  <td className="px-6 py-3.5 text-right">{formatCurrency(product.advertising)}</td>
                  <td
                    className={cn(
                      "px-6 py-3.5 text-right",
                      product.returnRate > 10 ? "text-danger" : "text-muted-foreground"
                    )}
                  >
                    {formatPercent(product.returnRate)}
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
