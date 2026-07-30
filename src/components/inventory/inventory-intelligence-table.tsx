"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, HelpCircle, Search } from "lucide-react";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { ProductIntelligenceDrawer } from "@/components/inventory/product-intelligence-drawer";
import { ProductThumbnail } from "@/components/inventory/product-thumbnail";
import { StockHealthBadge } from "@/components/inventory/stock-health-badge";
import { WarehouseDistributionPanel } from "@/components/inventory/warehouse-distribution-panel";
import {
  downloadInventoryIntelligenceExcel,
  totalsFromDistribution,
} from "@/lib/inventory-intelligence-excel";
import type {
  InventoryIntelligenceSkuRow,
  StockHealthStatus,
  StockHealthThresholds,
} from "@/lib/inventory-intelligence-types";
import { sortRowsBySpec, type SortSpec, type SortValue } from "@/lib/ui/table-sort";
import { cn, formatDate, formatNumber } from "@/lib/utils";

type InventoryIntelligenceTableProps = {
  rows: InventoryIntelligenceSkuRow[];
  thresholds: StockHealthThresholds;
  asOfDate: string;
  rangeFrom: string;
  rangeTo: string;
};

type SortKey =
  | "sku"
  | "productName"
  | "currentStock"
  | "warehouseCount"
  | "totalSales"
  | "lastSaleDate"
  | "daysSinceLastSale"
  | "stockHealth";

type WarehouseCountBucket = "all" | "1" | "2-3" | "4+";

const HEALTH_FILTER_OPTIONS: Array<"all" | StockHealthStatus> = [
  "all",
  "Healthy",
  "Slow",
  "At Risk",
  "Dead Stock",
];

const HEALTH_SORT_RANK: Record<StockHealthStatus, number> = {
  "Dead Stock": 0,
  "At Risk": 1,
  Slow: 2,
  Healthy: 3,
};

const HEALTH_DEFINITIONS: Record<StockHealthStatus, string> = {
  Healthy: "Last sale within Healthy threshold (default ≤7 days)",
  Slow: "Last sale within Slow band (default 8–30 days)",
  "At Risk": "Last sale within At Risk band (default 31–60 days)",
  "Dead Stock": "No sale beyond At Risk, or never sold",
};

/**
 * Total Sales (UI) = sum of period orders already on warehouseDistribution.
 * Sprint 6.46.1 SKU row has no totalSales / totalOrders field — do not invent server calcs.
 */
export function totalSalesFromDistribution(row: InventoryIntelligenceSkuRow): number {
  return totalsFromDistribution(row).orders;
}

function matchesWarehouseBucket(count: number, bucket: WarehouseCountBucket): boolean {
  if (bucket === "all") return true;
  if (bucket === "1") return count === 1;
  if (bucket === "2-3") return count >= 2 && count <= 3;
  return count >= 4;
}

const DEFAULT_SORT: SortSpec<SortKey> = { key: "daysSinceLastSale", direction: "desc" };

function intelligenceSortValue(row: InventoryIntelligenceSkuRow, key: SortKey): SortValue {
  switch (key) {
    case "sku":
      return row.sku;
    case "productName":
      return row.productName;
    case "currentStock":
      return row.currentStock;
    case "warehouseCount":
      return row.warehouseCount;
    case "totalSales":
      return totalSalesFromDistribution(row);
    case "lastSaleDate":
      return row.lastSaleDate;
    case "daysSinceLastSale":
      // Never sold (null) → treat as highest days for DESC attention-first sorting.
      return row.daysSinceLastSale ?? Number.POSITIVE_INFINITY;
    case "stockHealth":
      return HEALTH_SORT_RANK[row.stockHealth];
  }
}

function stockHealthTooltip(thresholds: StockHealthThresholds): string {
  return [
    `Healthy ≤${thresholds.healthyMaxDays}d`,
    `Slow ≤${thresholds.slowMaxDays}d`,
    `At Risk ≤${thresholds.atRiskMaxDays}d`,
    "else Dead Stock (or never sold)",
  ].join(" · ");
}

export function InventoryIntelligenceTable({
  rows,
  thresholds,
  asOfDate,
  rangeFrom,
  rangeTo,
}: InventoryIntelligenceTableProps) {
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<"all" | StockHealthStatus>("all");
  const [warehouseBucket, setWarehouseBucket] = useState<WarehouseCountBucket>("all");
  const [categoryId, setCategoryId] = useState("");
  const { sort, onSort, directionFor, isActive } = useCycleSort<SortKey>(DEFAULT_SORT);
  const getValue = useCallback(
    (row: InventoryIntelligenceSkuRow, key: SortKey) => intelligenceSortValue(row, key),
    []
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.categoryId) {
        map.set(row.categoryId, row.categoryName || row.categoryId);
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const healthCounts = useMemo(() => {
    const counts: Record<StockHealthStatus, number> = {
      Healthy: 0,
      Slow: 0,
      "At Risk": 0,
      "Dead Stock": 0,
    };
    for (const row of rows) {
      counts[row.stockHealth] += 1;
    }
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (healthFilter !== "all" && row.stockHealth !== healthFilter) return false;
      if (!matchesWarehouseBucket(row.warehouseCount, warehouseBucket)) return false;
      if (categoryId && row.categoryId !== categoryId) return false;
      if (!normalized) return true;
      return (
        row.sku.toLowerCase().includes(normalized) ||
        row.productName.toLowerCase().includes(normalized)
      );
    });

    return sortRowsBySpec(list, sort, getValue);
  }, [rows, query, healthFilter, warehouseBucket, categoryId, sort, getValue]);

  function toggleExpand(productId: string) {
    setExpanded((current) => ({ ...current, [productId]: !current[productId] }));
  }

  const selectedRow = useMemo(
    () =>
      selectedProductId
        ? (filtered.find((row) => row.productId === selectedProductId) ??
          rows.find((row) => row.productId === selectedProductId) ??
          null)
        : null,
    [selectedProductId, filtered, rows]
  );

  function handleExport() {
    downloadInventoryIntelligenceExcel(filtered, {
      asOfDate,
      rangeFrom,
      rangeTo,
    });
  }

  const selectClass =
    "rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50";

  const healthHelp = stockHealthTooltip(thresholds);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search SKU or product name…"
              className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/50"
              aria-label="Search SKU or product name"
            />
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                Stock Health
                <span title={healthHelp} className="inline-flex cursor-help text-muted-foreground/80">
                  <HelpCircle className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">{healthHelp}</span>
                </span>
              </span>
              <select
                value={healthFilter}
                onChange={(event) =>
                  setHealthFilter(event.target.value as "all" | StockHealthStatus)
                }
                className={selectClass}
                aria-label="Filter by stock health"
              >
                {HEALTH_FILTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All" : option}
                    {option !== "all" ? ` (${healthCounts[option]})` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span
                className="block text-xs font-medium text-muted-foreground"
                title="Distinct warehouses with current stock (wb_stock), not sales-period warehouses"
              >
                Warehouse Count
              </span>
              <select
                value={warehouseBucket}
                onChange={(event) =>
                  setWarehouseBucket(event.target.value as WarehouseCountBucket)
                }
                className={selectClass}
                aria-label="Filter by warehouse count"
              >
                <option value="all">All</option>
                <option value="1">1 warehouse</option>
                <option value="2-3">2–3 warehouses</option>
                <option value="4+">4+ warehouses</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">
                Product Category
              </span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className={cn(selectClass, "min-w-[10rem] max-w-[16rem]")}
                aria-label="Filter by product category"
              >
                <option value="">All categories</option>
                {categoryOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={handleExport}
              disabled={filtered.length === 0}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium transition-colors",
                filtered.length === 0
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-card-hover hover:text-foreground"
              )}
              aria-label="Export filtered rows to Excel"
            >
              <Download className="h-4 w-4" />
              Export Excel
            </button>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-3 border-t border-border/60 pt-3"
          role="group"
          aria-label="Stock health summary"
        >
          <SummaryChip label="Showing" value={formatNumber(filtered.length)} />
          <SummaryChip label="Healthy" value={formatNumber(healthCounts.Healthy)} tone="success" />
          <SummaryChip label="Slow" value={formatNumber(healthCounts.Slow)} tone="warning" />
          <SummaryChip label="At Risk" value={formatNumber(healthCounts["At Risk"])} tone="orange" />
          <SummaryChip
            label="Dead Stock"
            value={formatNumber(healthCounts["Dead Stock"])}
            tone="danger"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[1020px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-10 px-2 py-3" aria-label="Expand" />
              <SortableTh
                label="SKU / Product"
                active={isActive("sku")}
                direction={directionFor("sku")}
                onClick={() => onSort("sku")}
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Current Stock"
                active={isActive("currentStock")}
                direction={directionFor("currentStock")}
                onClick={() => onSort("currentStock")}
                align="right"
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label={
                  <span title="Distinct warehouses with current stock (wb_stock)">
                    Warehouse Count
                  </span>
                }
                active={isActive("warehouseCount")}
                direction={directionFor("warehouseCount")}
                onClick={() => onSort("warehouseCount")}
                align="right"
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Total Sales"
                active={isActive("totalSales")}
                direction={directionFor("totalSales")}
                onClick={() => onSort("totalSales")}
                align="right"
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Last Sale Date"
                active={isActive("lastSaleDate")}
                direction={directionFor("lastSaleDate")}
                onClick={() => onSort("lastSaleDate")}
                align="right"
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label="Days Since Last Sale"
                active={isActive("daysSinceLastSale")}
                direction={directionFor("daysSinceLastSale")}
                onClick={() => onSort("daysSinceLastSale")}
                align="right"
                className="px-3 py-3 font-medium"
              />
              <SortableTh
                label={
                  <span title={healthHelp}>Stock Health</span>
                }
                active={isActive("stockHealth")}
                direction={directionFor("stockHealth")}
                onClick={() => onSort("stockHealth")}
                className="px-3 py-3 font-medium"
              />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "No inventory intelligence rows for this scope."
                    : "No SKUs match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const isOpen = Boolean(expanded[row.productId]);
                const canExpand = row.warehouseDistribution.length > 0;
                const totalSales = totalSalesFromDistribution(row);
                const isSelected = selectedProductId === row.productId;

                return (
                  <Fragment key={row.productId}>
                    <tr
                      onClick={() => setSelectedProductId(row.productId)}
                      className={cn(
                        "cursor-pointer border-t border-border/60 transition-colors hover:bg-card-hover/40",
                        isOpen && "bg-card-hover/20",
                        isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/20"
                      )}
                    >
                      <td className="px-2 py-2.5">
                        {canExpand ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleExpand(row.productId);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-card-hover hover:text-foreground"
                            aria-expanded={isOpen}
                            aria-label={
                              isOpen
                                ? `Collapse warehouse sales for ${row.sku}`
                                : `Expand warehouse sales for ${row.sku}`
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="inline-block w-6" aria-hidden />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <ProductThumbnail
                            key={row.productId}
                            nmId={row.nmId}
                            alt=""
                            size={40}
                          />
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-medium">{row.sku}</p>
                            <p
                              className="max-w-[240px] truncate text-xs text-muted-foreground"
                              title={row.productName}
                            >
                              {row.productName || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatNumber(row.currentStock)}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right tabular-nums"
                        title="Distinct warehouses with current stock"
                      >
                        {formatNumber(row.warehouseCount)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {formatNumber(totalSales)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {row.lastSaleDate ? formatDate(row.lastSaleDate) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.daysSinceLastSale == null
                          ? "—"
                          : formatNumber(row.daysSinceLastSale)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span title={HEALTH_DEFINITIONS[row.stockHealth]}>
                          <StockHealthBadge status={row.stockHealth} />
                        </span>
                      </td>
                    </tr>
                    {isOpen && canExpand && (
                      <tr className="border-t border-border/40 bg-card-hover/10">
                        <td colSpan={8} className="px-4 py-3">
                          <WarehouseDistributionPanel
                            rows={row.warehouseDistribution}
                            sku={row.sku}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Warehouse sales period {rangeFrom} → {rangeTo}
        {" · "}
        Health as of {asOfDate}
        {" · "}
        Thresholds: Healthy ≤{thresholds.healthyMaxDays}d · Slow ≤{thresholds.slowMaxDays}d · At
        Risk ≤{thresholds.atRiskMaxDays}d · else Dead Stock
        {" · "}
        Total Sales = Σ warehouse sales orders (period)
        {" · "}
        Warehouse Count = distinct warehouses with current stock
        {" · "}
        Click a SKU row to open Product Intelligence
      </p>

      <ProductIntelligenceDrawer
        row={selectedRow}
        onClose={() => setSelectedProductId(null)}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
      />
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "orange" | "danger";
}) {
  return (
    <div className="min-w-[5.5rem]">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "orange" && "text-orange-600 dark:text-orange-400",
          tone === "danger" && "text-danger",
          !tone && "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
