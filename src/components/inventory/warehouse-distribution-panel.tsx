"use client";

import { useCallback, useMemo } from "react";
import { DonutChart } from "@/components/charts/donut-chart";
import { formatChartValue } from "@/components/charts/chart-tooltip";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import type { WarehouseDistributionRow } from "@/lib/inventory-intelligence-types";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type WarehouseDistributionPanelProps = {
  rows: WarehouseDistributionRow[];
  /** Optional SKU label shown in the section heading. */
  sku?: string;
  /** Compact heading when embedded in the Product Intelligence drawer. */
  compactTitle?: boolean;
};

type SortKey = "warehouse" | "orders" | "units" | "revenue" | "share";

const DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function sortValue(row: WarehouseDistributionRow, key: SortKey): SortValue {
  switch (key) {
    case "warehouse":
      return formatWarehouseName(row.warehouse);
    case "orders":
      return row.orders;
    case "units":
      return row.unitsSold;
    case "revenue":
      return row.revenue;
    case "share":
      return row.salesSharePercent;
  }
}

/**
 * Warehouse Sales attribution panel — orders / units / sales by warehouse.
 * Not Warehouse Distribution (stock geography).
 */
export function WarehouseDistributionPanel({
  rows,
  sku,
  compactTitle = false,
}: WarehouseDistributionPanelProps) {
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: WarehouseDistributionRow, key: SortKey) => sortValue(row, key),
    []
  );
  const sortedRows = useMemo(
    () => sortRowsBySpec(rows, sort, getValue),
    [rows, sort, getValue]
  );

  let orders = 0;
  let units = 0;
  let revenue = 0;
  for (const wh of rows) {
    orders += wh.orders;
    units += wh.unitsSold;
    revenue += wh.revenue;
  }
  const warehouseCount = rows.length;

  const title = sku
    ? compactTitle
      ? "Warehouse Sales"
      : `Warehouse Sales · ${sku}`
    : "Warehouse Sales";

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">No warehouse sales in this period.</p>
      </div>
    );
  }

  const donutSlices = (() => {
    const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const slices = top.map((wh) => ({
      name: formatWarehouseName(wh.warehouse),
      value: wh.revenue,
    }));
    const otherRevenue = rest.reduce((sum, wh) => sum + wh.revenue, 0);
    if (otherRevenue > 0) {
      slices.push({ name: "Other", value: otherRevenue });
    }
    return slices;
  })();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            Total Orders{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(orders)}
            </span>
          </span>
          <span>
            Total Units{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(units)}
            </span>
          </span>
          <span>
            Total Sales{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatCurrency(revenue)}
            </span>
          </span>
          <span>
            Warehouse Count{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatNumber(warehouseCount)}
            </span>
          </span>
        </div>
      </div>

      <DonutChart
        data={donutSlices}
        centerLabel="Sales"
        centerValue={formatChartValue(revenue, "currency")}
        valueFormat="currency"
        height={200}
        legendPlacement="side"
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-background">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortableTh
                label="Warehouse"
                active={isActive("warehouse")}
                direction={directionFor("warehouse")}
                onClick={() => onSort("warehouse")}
                className="px-3 py-2"
              />
              <SortableTh
                label="Orders"
                active={isActive("orders")}
                direction={directionFor("orders")}
                onClick={() => onSort("orders")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Units Sold"
                active={isActive("units")}
                direction={directionFor("units")}
                onClick={() => onSort("units")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Sales"
                active={isActive("revenue")}
                direction={directionFor("revenue")}
                onClick={() => onSort("revenue")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Order Share"
                active={isActive("share")}
                direction={directionFor("share")}
                onClick={() => onSort("share")}
                align="right"
                className="px-3 py-2"
              />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((wh) => (
              <tr key={wh.warehouse} className="border-t border-border/50">
                <td
                  className="px-3 py-2 font-medium"
                  title={formatWarehouseName(wh.warehouse)}
                >
                  {formatWarehouseName(wh.warehouse)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(wh.orders)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(wh.unitsSold)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {formatCurrency(wh.revenue)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {formatPercent(wh.salesSharePercent)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
