"use client";

import { useCallback, useMemo } from "react";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { formatCurrency, formatNumber } from "@/lib/utils";

type PurchaseLineRow = {
  id: string;
  supplier_article: string;
  product_name?: string | null;
  quantity: number;
  unit_cost: number;
};

type PurchaseLinesTableProps = {
  lines: PurchaseLineRow[];
  currency: string;
};

type SortKey = "article" | "product" | "quantity" | "unitCost" | "totalCost";

const DEFAULT_SORT = { key: "article" as const, direction: "asc" as const };

function sortValue(row: PurchaseLineRow, key: SortKey): SortValue {
  switch (key) {
    case "article":
      return row.supplier_article;
    case "product":
      return row.product_name;
    case "quantity":
      return row.quantity;
    case "unitCost":
      return row.unit_cost;
    case "totalCost":
      return row.quantity * row.unit_cost;
  }
}

export function PurchaseLinesTable({ lines, currency }: PurchaseLinesTableProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: PurchaseLineRow, key: SortKey) => sortValue(row, key),
    []
  );
  const sorted = useMemo(
    () => sortRowsBySpec(lines, sort, getValue),
    [lines, sort, getValue]
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <p className="text-sm text-muted-foreground">{lines.length} imported products</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <SortableTh
                label="SKU"
                active={isActive("article")}
                direction={directionFor("article")}
                onClick={() => onSort("article")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Product Name"
                active={isActive("product")}
                direction={directionFor("product")}
                onClick={() => onSort("product")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Quantity"
                active={isActive("quantity")}
                direction={directionFor("quantity")}
                onClick={() => onSort("quantity")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Unit Cost"
                active={isActive("unitCost")}
                direction={directionFor("unitCost")}
                onClick={() => onSort("unitCost")}
                className="px-6 py-3"
              />
              <SortableTh
                label="Total Cost"
                active={isActive("totalCost")}
                direction={directionFor("totalCost")}
                onClick={() => onSort("totalCost")}
                className="px-6 py-3"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                  No products imported for this purchase.
                </td>
              </tr>
            ) : (
              sorted.map((line) => (
                <tr key={line.id} className="border-b border-border/50">
                  <td className="px-6 py-3.5 font-mono text-xs font-medium text-primary">
                    {line.supplier_article}
                  </td>
                  <td className="px-6 py-3.5">{line.product_name ?? "—"}</td>
                  <td className="px-6 py-3.5">{formatNumber(line.quantity)}</td>
                  <td className="px-6 py-3.5 font-medium">
                    {formatCurrency(line.unit_cost, currency)}
                  </td>
                  <td className="px-6 py-3.5 font-medium">
                    {formatCurrency(line.quantity * line.unit_cost, currency)}
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
