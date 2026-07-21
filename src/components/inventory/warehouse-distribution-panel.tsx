"use client";

import type { WarehouseDistributionRow } from "@/lib/inventory-intelligence-types";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type WarehouseDistributionPanelProps = {
  rows: WarehouseDistributionRow[];
  /** Optional SKU label shown in the section heading. */
  sku?: string;
  /** Compact heading when embedded in the Product Intelligence drawer. */
  compactTitle?: boolean;
};

/**
 * Warehouse Distribution table + period summary totals.
 * Totals are summed from the provided rows only (no new server calcs).
 */
export function WarehouseDistributionPanel({
  rows,
  sku,
  compactTitle = false,
}: WarehouseDistributionPanelProps) {
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
      ? "Warehouse Distribution"
      : `Warehouse Distribution · ${sku}`
    : "Warehouse Distribution";

  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">No warehouse sales in this period.</p>
      </div>
    );
  }

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
            Total Revenue{" "}
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
      <div className="overflow-x-auto rounded-xl border border-border bg-background">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Warehouse</th>
              <th className="px-3 py-2 text-right font-medium">Orders</th>
              <th className="px-3 py-2 text-right font-medium">Units Sold</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Sales Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((wh) => (
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
