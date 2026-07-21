"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { FILTER_PARAMS } from "@/lib/filter-params";
import {
  isEmptyWarehouseName,
  sumRoundedShares,
  type WarehouseProductSalesRow,
  type WarehouseSalesRow,
  type WarehouseSalesTotals,
} from "@/lib/warehouse-sales-analytics";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type WarehouseSalesAnalyticsTableProps = {
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
  drillDownWarehouse: string | null;
  products: WarehouseProductSalesRow[] | null;
  rangeFrom: string;
  rangeTo: string;
};

function warehouseHref(pathname: string, searchParams: URLSearchParams, warehouse: string): string {
  const params = new URLSearchParams(searchParams.toString());
  params.set("warehouse", warehouse);
  return `${pathname}?${params.toString()}`;
}

function backHref(pathname: string, searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("warehouse");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function WarehouseSalesAnalyticsTable({
  rows,
  totals,
  drillDownWarehouse,
  products,
  rangeFrom,
  rangeTo,
}: WarehouseSalesAnalyticsTableProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (hideEmpty && isEmptyWarehouseName(row.warehouse)) return false;
      if (!normalized) return true;
      const raw = row.warehouse || "";
      const latin = formatWarehouseName(raw);
      return (
        raw.toLowerCase().includes(normalized) ||
        latin.toLowerCase().includes(normalized)
      );
    });
  }, [rows, query, hideEmpty]);

  /** Shares are vs full cohort (all non-NULL warehouses); must total ~100%. */
  const orderShareTotal = sumRoundedShares(rows.map((r) => r.orderSharePercent));
  const revenueShareTotal = sumRoundedShares(rows.map((r) => r.revenueSharePercent));

  if (drillDownWarehouse) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={backHref(pathname, new URLSearchParams(searchParams.toString()))}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All warehouses
          </Link>
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {drillDownWarehouse ? formatWarehouseName(drillDownWarehouse) : "—"}
            </h2>
            <p className="text-xs text-muted-foreground">
              Product breakdown · {formatDateLabel(rangeFrom)} → {formatDateLabel(rangeTo)}
              {products ? ` · ${products.length} products` : ""}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Product Name</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">Units</th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {(products ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No completed sales for this warehouse in the selected period.
                  </td>
                </tr>
              ) : (
                (products ?? []).map((row) => (
                  <tr
                    key={row.productId}
                    className="border-t border-border/60 transition-colors hover:bg-card-hover/40"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs font-medium">{row.sku}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.productName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(row.orders)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(row.units)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatCurrency(row.revenue)}
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search warehouse…"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
            aria-label="Search warehouse"
          />
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={(event) => setHideEmpty(event.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Hide empty warehouses
        </label>
      </div>

      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        role="group"
        aria-label="Warehouse sales summary"
      >
        <MetricCard
          size="compact"
          title="Warehouses"
          value={formatKpiCount(filtered.length)}
          icon={KPI_ICONS.inventory}
        />
        <MetricCard
          size="compact"
          title="Orders"
          value={formatKpiCount(totals.orders)}
          icon={KPI_ICONS.orders}
        />
        <MetricCard
          size="compact"
          title="Units"
          value={formatKpiCount(totals.units)}
          icon={KPI_ICONS.units}
        />
        <MetricCard
          size="compact"
          title="Revenue"
          value={formatKpiCurrency(totals.revenue)}
          icon={KPI_ICONS.revenue}
        />
        <MetricCard
          size="compact"
          title="Order Share Σ"
          value={formatKpiPercent(orderShareTotal)}
          icon={KPI_ICONS.conversion}
          hint="All warehouses, 1 decimal"
        />
        <MetricCard
          size="compact"
          title="Revenue Share Σ"
          value={formatKpiPercent(revenueShareTotal)}
          icon={KPI_ICONS.conversion}
          hint="All warehouses, 1 decimal"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-3 font-medium">Warehouse</th>
              <th className="px-4 py-3 text-right font-medium">Orders</th>
              <th className="px-4 py-3 text-right font-medium">Units</th>
              <th className="px-4 py-3 text-right font-medium">Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Order Share</th>
              <th className="px-4 py-3 text-right font-medium">Revenue Share</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No warehouse sales in the selected period.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const label = row.warehouse
                  ? formatWarehouseName(row.warehouse)
                  : "—";
                const href = warehouseHref(
                  pathname,
                  new URLSearchParams(searchParams.toString()),
                  row.warehouse
                );
                return (
                  <tr
                    key={row.warehouse || "__empty__"}
                    className="border-t border-border/60 transition-colors hover:bg-card-hover/40"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={href}
                        className="font-medium text-primary hover:underline"
                        title="View product breakdown"
                      >
                        {label}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(row.orders)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(row.units)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatPercent(row.orderSharePercent)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatPercent(row.revenueSharePercent)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-border bg-card-hover/30 text-xs font-medium">
                <td className="px-4 py-2.5">Total (all warehouses)</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(totals.orders)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(totals.units)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(totals.revenue)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatPercent(orderShareTotal)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatPercent(revenueShareTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Period {rangeFrom} → {rangeTo}
        {" · "}
        Scope from Dashboard filters ({FILTER_PARAMS.from}/{FILTER_PARAMS.to})
        {" · "}
        Order Share uses Orders, never Units
      </p>
    </div>
  );
}

function formatDateLabel(iso: string): string {
  return iso;
}
