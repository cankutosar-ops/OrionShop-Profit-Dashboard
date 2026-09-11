"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SortableTh } from "@/components/ui/sortable-th";
import { WarehouseLocationSelect } from "@/components/inventory/warehouse-location-select";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { FILTER_PARAMS } from "@/lib/filter-params";
import {
  isEmptyWarehouseName,
  sumRoundedShares,
  type WarehouseProductSalesRow,
  type WarehouseSalesRow,
  type WarehouseSalesTotals,
} from "@/lib/warehouse-sales-analytics";
import type { WarehouseLocation } from "@/lib/warehouse-locations";
import { buildWarehouseLocations } from "@/lib/warehouse-locations";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { formatWarehouseName } from "@/lib/warehouse-name-aliases";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type WarehouseSalesAnalyticsTableProps = {
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
  drillDownWarehouse: string | null;
  products: WarehouseProductSalesRow[] | null;
  /** Warehouse Locations (WB + FBS) — filter by name only. */
  locations?: WarehouseLocation[];
  rangeFrom: string;
  rangeTo: string;
};

type WarehouseSortKey =
  | "warehouse"
  | "orders"
  | "ordersAmount"
  | "units"
  | "revenue"
  | "orderShare"
  | "revenueShare";

type ProductSortKey = "sku" | "productName" | "orders" | "units" | "revenue";

const WAREHOUSE_DEFAULT_SORT = {
  key: "revenue" as const,
  direction: "desc" as const,
};

const PRODUCT_DEFAULT_SORT = {
  key: "revenue" as const,
  direction: "desc" as const,
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

function warehouseSortValue(row: WarehouseSalesRow, key: WarehouseSortKey): SortValue {
  switch (key) {
    case "warehouse":
      return row.warehouse ? formatWarehouseName(row.warehouse) : "";
    case "orders":
      return row.orders;
    case "ordersAmount":
      return row.ordersAmount;
    case "units":
      return row.units;
    case "revenue":
      return row.revenue;
    case "orderShare":
      return row.orderSharePercent;
    case "revenueShare":
      return row.revenueSharePercent;
  }
}

function productSortValue(row: WarehouseProductSalesRow, key: ProductSortKey): SortValue {
  switch (key) {
    case "sku":
      return row.sku;
    case "productName":
      return row.productName;
    case "orders":
      return row.orders;
    case "units":
      return row.units;
    case "revenue":
      return row.revenue;
  }
}

export function WarehouseSalesAnalyticsTable({
  rows,
  totals,
  drillDownWarehouse,
  products,
  locations = [],
  rangeFrom,
  rangeTo,
}: WarehouseSalesAnalyticsTableProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [hideEmpty, setHideEmpty] = useState(true);

  const locationOptions = useMemo(() => {
    if (locations.length > 0) return locations;
    return buildWarehouseLocations(rows.map((r) => ({ name: r.warehouse, active: true })));
  }, [locations, rows]);

  const onLocationChange = useCallback(
    (name: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!name) params.delete("warehouse");
      else params.set("warehouse", name);
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const {
    sort: warehouseSort,
    onSort: onWarehouseSort,
    directionFor: warehouseDir,
    isActive: warehouseActive,
  } = useCycleSort<WarehouseSortKey>(WAREHOUSE_DEFAULT_SORT);

  const {
    sort: productSort,
    onSort: onProductSort,
    directionFor: productDir,
    isActive: productActive,
  } = useCycleSort<ProductSortKey>(PRODUCT_DEFAULT_SORT);

  const getWarehouseValue = useCallback(
    (row: WarehouseSalesRow, key: WarehouseSortKey) => warehouseSortValue(row, key),
    []
  );
  const getProductValue = useCallback(
    (row: WarehouseProductSalesRow, key: ProductSortKey) => productSortValue(row, key),
    []
  );

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

  const sortedWarehouses = useMemo(
    () => sortRowsBySpec(filtered, warehouseSort, getWarehouseValue),
    [filtered, warehouseSort, getWarehouseValue]
  );

  const sortedProducts = useMemo(
    () => sortRowsBySpec(products ?? [], productSort, getProductValue),
    [products, productSort, getProductValue]
  );

  /** Shares are vs full cohort (including Unknown Warehouse); must total ~100%. */
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
                <SortableTh
                  label="SKU"
                  active={productActive("sku")}
                  direction={productDir("sku")}
                  onClick={() => onProductSort("sku")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Product Name"
                  active={productActive("productName")}
                  direction={productDir("productName")}
                  onClick={() => onProductSort("productName")}
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Orders"
                  active={productActive("orders")}
                  direction={productDir("orders")}
                  onClick={() => onProductSort("orders")}
                  align="right"
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Units"
                  active={productActive("units")}
                  direction={productDir("units")}
                  onClick={() => onProductSort("units")}
                  align="right"
                  className="px-4 py-3"
                />
                <SortableTh
                  label="Sales"
                  active={productActive("revenue")}
                  direction={productDir("revenue")}
                  onClick={() => onProductSort("revenue")}
                  align="right"
                  className="px-4 py-3"
                />
              </tr>
            </thead>
            <tbody>
              {sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No completed sales for this warehouse in the selected period.
                  </td>
                </tr>
              ) : (
                sortedProducts.map((row) => (
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            Warehouse location
            <WarehouseLocationSelect
              value={drillDownWarehouse ?? ""}
              onChange={onLocationChange}
              locations={locationOptions}
              className="min-w-[12rem]"
            />
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 pb-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(event) => setHideEmpty(event.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Hide empty warehouses
          </label>
        </div>
      </div>

      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7"
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
          title="Orders Amount"
          value={formatKpiCurrency(totals.ordersAmount)}
          icon={KPI_ICONS.purchases}
          hint="Σ order price_with_disc × quantity (wb_orders)"
        />
        <MetricCard
          size="compact"
          title="Units"
          value={formatKpiCount(totals.units)}
          icon={KPI_ICONS.units}
        />
        <MetricCard
          size="compact"
          title="Sales"
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
          title="Sales Share Σ"
          value={formatKpiPercent(revenueShareTotal)}
          icon={KPI_ICONS.conversion}
          hint="All warehouses, 1 decimal"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <SortableTh
                label="Warehouse"
                active={warehouseActive("warehouse")}
                direction={warehouseDir("warehouse")}
                onClick={() => onWarehouseSort("warehouse")}
                className="px-4 py-3"
              />
              <SortableTh
                label="Orders"
                active={warehouseActive("orders")}
                direction={warehouseDir("orders")}
                onClick={() => onWarehouseSort("orders")}
                align="right"
                className="px-4 py-3"
              />
              <SortableTh
                label="Orders Amount"
                active={warehouseActive("ordersAmount")}
                direction={warehouseDir("ordersAmount")}
                onClick={() => onWarehouseSort("ordersAmount")}
                align="right"
                className="px-4 py-3"
              />
              <SortableTh
                label="Units"
                active={warehouseActive("units")}
                direction={warehouseDir("units")}
                onClick={() => onWarehouseSort("units")}
                align="right"
                className="px-4 py-3"
              />
              <SortableTh
                label="Sales"
                active={warehouseActive("revenue")}
                direction={warehouseDir("revenue")}
                onClick={() => onWarehouseSort("revenue")}
                align="right"
                className="px-4 py-3"
              />
              <SortableTh
                label="Order Share"
                active={warehouseActive("orderShare")}
                direction={warehouseDir("orderShare")}
                onClick={() => onWarehouseSort("orderShare")}
                align="right"
                className="px-4 py-3"
              />
              <SortableTh
                label="Sales Share"
                active={warehouseActive("revenueShare")}
                direction={warehouseDir("revenueShare")}
                onClick={() => onWarehouseSort("revenueShare")}
                align="right"
                className="px-4 py-3"
              />
            </tr>
          </thead>
          <tbody>
            {sortedWarehouses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No warehouse sales in the selected period.
                </td>
              </tr>
            ) : (
              sortedWarehouses.map((row) => {
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
                      {formatCurrency(row.ordersAmount)}
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
                  {formatCurrency(totals.ordersAmount)}
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
