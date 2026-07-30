"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { LogisticsBreakdownHint } from "@/components/analytics/logistics-breakdown-hint";
import { SortableTh } from "@/components/ui/sortable-th";
import { useCycleSort } from "@/hooks/use-cycle-sort";
import { useProductSkuAnalytics } from "@/hooks/use-product-sku-analytics";
import { sortRowsBySpec, type SortValue } from "@/lib/ui/table-sort";
import { PRODUCT_INTEL_NAV_PARAMS } from "@/lib/product-intelligence-nav";
import { getOperationalMarginBand } from "@/lib/product-operational-metrics";
import type { ProductAnalyticsSkuRow, ProductAnalyticsV3Row } from "@/types/database";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductAnalyticsV8TableProps = {
  title: string;
  description?: string;
  rows: ProductAnalyticsV3Row[];
  rangeFrom: string;
  rangeTo: string;
};

function operationalVariant(marginPercent: number): "success" | "warning" | "danger" | "muted" {
  const band = getOperationalMarginBand(marginPercent);
  if (band === "strong") return "success";
  if (band === "healthy") return "muted";
  if (band === "weak") return "warning";
  return "danger";
}

const stickyExpandCell =
  "sticky left-0 z-20 w-10 min-w-10 bg-card group-hover:bg-card-hover";
const stickyModelCell =
  "sticky left-10 z-20 min-w-[6.5rem] bg-card group-hover:bg-card-hover border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]";
const stickyModelHeader =
  "sticky left-10 z-20 min-w-[6.5rem] bg-card border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]";
const stickyExpandHeader = "sticky left-0 z-20 w-10 min-w-10 bg-card";

type MainSortKey =
  | "model"
  | "product"
  | "currentStock"
  | "orders"
  | "purchases"
  | "conversion"
  | "revenue"
  | "marketplaceFees"
  | "totalLogistics"
  | "productCost"
  | "operationalProfit"
  | "operationalMargin";

type SkuSortKey =
  | "size"
  | "barcode"
  | "currentStock"
  | "orders"
  | "purchases"
  | "conversion"
  | "revenue";

const MAIN_DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };
const SKU_DEFAULT_SORT = { key: "revenue" as const, direction: "desc" as const };

function mainSortValue(row: ProductAnalyticsV3Row, key: MainSortKey): SortValue {
  switch (key) {
    case "model":
      return row.supplierArticle;
    case "product":
      return row.productName;
    case "currentStock":
      return row.currentStock;
    case "orders":
      return row.orders;
    case "purchases":
      return row.purchases;
    case "conversion":
      return row.conversionPercent;
    case "revenue":
      return row.revenue;
    case "marketplaceFees":
      return row.marketplaceFees;
    case "totalLogistics":
      return row.totalLogistics;
    case "productCost":
      return row.productCost;
    case "operationalProfit":
      return row.operationalProfit;
    case "operationalMargin":
      return row.operationalMarginPercent;
  }
}

function skuSortValue(row: ProductAnalyticsSkuRow, key: SkuSortKey): SortValue {
  switch (key) {
    case "size":
      return row.size;
    case "barcode":
      return row.barcode ?? "";
    case "currentStock":
      return row.currentStock;
    case "orders":
      return row.orders;
    case "purchases":
      return row.purchases;
    case "conversion":
      return row.conversionPercent;
    case "revenue":
      return row.revenue;
  }
}

function SkuChildRows({
  productId,
  from,
  to,
  isOpen,
  colSpan,
}: {
  productId: string;
  from: string;
  to: string;
  isOpen: boolean;
  colSpan: number;
}) {
  const { data, isLoading, isError, error } = useProductSkuAnalytics(productId, from, to, isOpen);
  const { sort, onSort, directionFor, isActive } = useCycleSort<SkuSortKey>(SKU_DEFAULT_SORT);
  const getSkuValue = useCallback(
    (row: ProductAnalyticsSkuRow, key: SkuSortKey) => skuSortValue(row, key),
    []
  );
  const sortedSkus = useMemo(() => {
    if (!data?.skus.length) return [];
    return sortRowsBySpec(data.skus, sort, getSkuValue);
  }, [data?.skus, sort, getSkuValue]);

  if (!isOpen) return null;

  return (
    <tr className="bg-card-hover/20">
      <td colSpan={colSpan} className="p-0">
        <div className="border-l-2 border-primary/30 px-4 py-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading SKU rows…
            </div>
          )}
          {isError && (
            <p className="py-2 text-sm text-danger">
              {error instanceof Error ? error.message : "Failed to load SKU rows"}
            </p>
          )}
          {data && data.skus.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No catalog sizes found for this model. Sync products to load SKU sizes.
            </p>
          )}
          {data && data.skus.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <SortableTh
                      label="Size"
                      active={isActive("size")}
                      direction={directionFor("size")}
                      onClick={() => onSort("size")}
                      className="px-2 py-1.5"
                    />
                    <SortableTh
                      label="Barcode"
                      active={isActive("barcode")}
                      direction={directionFor("barcode")}
                      onClick={() => onSort("barcode")}
                      className="px-2 py-1.5"
                    />
                    <SortableTh
                      label="Current Stock"
                      active={isActive("currentStock")}
                      direction={directionFor("currentStock")}
                      onClick={() => onSort("currentStock")}
                      align="right"
                      className="px-2 py-1.5"
                    />
                    <SortableTh
                      label="Orders"
                      active={isActive("orders")}
                      direction={directionFor("orders")}
                      onClick={() => onSort("orders")}
                      align="right"
                      className="px-2 py-1.5"
                    />
                    <SortableTh
                      label="Buyout"
                      active={isActive("purchases")}
                      direction={directionFor("purchases")}
                      onClick={() => onSort("purchases")}
                      align="right"
                      className="px-2 py-1.5"
                    />
                    <SortableTh
                      label="Conversion %"
                      active={isActive("conversion")}
                      direction={directionFor("conversion")}
                      onClick={() => onSort("conversion")}
                      align="right"
                      className="px-2 py-1.5"
                    />
                    <SortableTh
                      label="Revenue"
                      active={isActive("revenue")}
                      direction={directionFor("revenue")}
                      onClick={() => onSort("revenue")}
                      align="right"
                      className="px-2 py-1.5"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedSkus.map((sku) => (
                    <SkuRow key={sku.variantKey} sku={sku} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function SkuRow({ sku }: { sku: ProductAnalyticsSkuRow }) {
  const hasOrders = sku.orders > 0;

  return (
    <tr className="border-t border-border/40">
      <td className="px-2 py-2 font-medium">{sku.size}</td>
      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{sku.barcode ?? "—"}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatNumber(sku.currentStock)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatNumber(sku.orders)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatNumber(sku.purchases)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {hasOrders ? formatPercent(sku.conversionPercent) : "—"}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatCurrency(sku.revenue)}
      </td>
    </tr>
  );
}

function filterProductAnalyticsRows(
  rows: ProductAnalyticsV3Row[],
  productParam: string,
  skuParam: string
): ProductAnalyticsV3Row[] {
  if (productParam) {
    return rows.filter((row) => String(row.productId) === productParam);
  }
  if (skuParam) {
    const skuLower = skuParam.toLowerCase();
    const exact = rows.filter((row) => row.supplierArticle.toLowerCase() === skuLower);
    if (exact.length > 0) return exact;
    return rows.filter((row) => row.supplierArticle.toLowerCase().includes(skuLower));
  }
  return rows;
}

function resolveDeepLinkExpandProductId(
  displayRows: ProductAnalyticsV3Row[],
  productParam: string,
  skuParam: string
): string | null {
  if (productParam) {
    const match = displayRows.find((row) => String(row.productId) === productParam);
    return match ? String(match.productId) : null;
  }
  if (!skuParam || displayRows.length === 0) return null;
  const skuLower = skuParam.toLowerCase();
  const exact = displayRows.find((row) => row.supplierArticle.toLowerCase() === skuLower);
  return String((exact ?? displayRows[0]).productId);
}

export function ProductAnalyticsV8Table({
  title,
  description,
  rows,
  rangeFrom,
  rangeTo,
}: ProductAnalyticsV8TableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const searchParams = useSearchParams();

  const skuParam = searchParams.get(PRODUCT_INTEL_NAV_PARAMS.sku)?.trim() ?? "";
  const productParam = searchParams.get(PRODUCT_INTEL_NAV_PARAMS.product)?.trim() ?? "";
  const isDeepLinkFiltered = Boolean(productParam || skuParam);

  const filteredRows = useMemo(
    () => filterProductAnalyticsRows(rows, productParam, skuParam),
    [rows, productParam, skuParam]
  );

  const { sort, onSort, directionFor, isActive } = useCycleSort<MainSortKey>(MAIN_DEFAULT_SORT);
  const getMainValue = useCallback(
    (row: ProductAnalyticsV3Row, key: MainSortKey) => mainSortValue(row, key),
    []
  );
  const displayRows = useMemo(
    () => sortRowsBySpec(filteredRows, sort, getMainValue),
    [filteredRows, sort, getMainValue]
  );

  const deepLinkExpandProductId = useMemo(
    () => resolveDeepLinkExpandProductId(displayRows, productParam, skuParam),
    [displayRows, productParam, skuParam]
  );

  useEffect(() => {
    if (!deepLinkExpandProductId) return;
    setExpanded((current) =>
      current[deepLinkExpandProductId]
        ? current
        : { ...current, [deepLinkExpandProductId]: true }
    );
  }, [deepLinkExpandProductId]);

  const inventoryHref = (productId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("product", productId);
    return `/inventory?${params.toString()}`;
  };

  const toggle = (productId: string) => {
    const key = String(productId);
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  };

  const expandedCount = useMemo(
    () => Object.values(expanded).filter(Boolean).length,
    [expanded]
  );
  const parentColSpan = 13;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        {isDeepLinkFiltered && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Showing {displayRows.length} of {rows.length} product
            {rows.length === 1 ? "" : "s"}
            {skuParam ? ` matching “${skuParam}”` : ""}
          </p>
        )}
        {expandedCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {expandedCount} model(s) expanded · SKU data cached via React Query
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className={cn("px-2 py-2", stickyExpandHeader)} />
              <SortableTh
                label="Model"
                active={isActive("model")}
                direction={directionFor("model")}
                onClick={() => onSort("model")}
                align="left"
                className={cn("px-3 py-2", stickyModelHeader)}
              />
              <SortableTh
                label="Product"
                active={isActive("product")}
                direction={directionFor("product")}
                onClick={() => onSort("product")}
                align="left"
                className="px-3 py-2"
              />
              <SortableTh
                label="Current Stock"
                active={isActive("currentStock")}
                direction={directionFor("currentStock")}
                onClick={() => onSort("currentStock")}
                align="right"
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
                label="Buyout"
                active={isActive("purchases")}
                direction={directionFor("purchases")}
                onClick={() => onSort("purchases")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Conv. %"
                active={isActive("conversion")}
                direction={directionFor("conversion")}
                onClick={() => onSort("conversion")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Revenue"
                active={isActive("revenue")}
                direction={directionFor("revenue")}
                onClick={() => onSort("revenue")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Marketplace Fees"
                active={isActive("marketplaceFees")}
                direction={directionFor("marketplaceFees")}
                onClick={() => onSort("marketplaceFees")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Total Logistics"
                active={isActive("totalLogistics")}
                direction={directionFor("totalLogistics")}
                onClick={() => onSort("totalLogistics")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Product Cost"
                active={isActive("productCost")}
                direction={directionFor("productCost")}
                onClick={() => onSort("productCost")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Oper. Profit"
                active={isActive("operationalProfit")}
                direction={directionFor("operationalProfit")}
                onClick={() => onSort("operationalProfit")}
                align="right"
                className="px-3 py-2"
              />
              <SortableTh
                label="Oper. Margin"
                active={isActive("operationalMargin")}
                direction={directionFor("operationalMargin")}
                onClick={() => onSort("operationalMargin")}
                align="right"
                className="px-3 py-2"
              />
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={parentColSpan} className="px-4 py-8 text-center text-muted-foreground">
                  {isDeepLinkFiltered
                    ? "No products match the deep-link filter"
                    : "No product data for the selected period"}
                </td>
              </tr>
            ) : (
              displayRows.map((row) => {
                const productKey = String(row.productId);
                const isOpen = Boolean(expanded[productKey]);
                const variant = operationalVariant(row.operationalMarginPercent);

                return (
                  <Fragment key={productKey}>
                    <tr className="group border-b border-border/50 transition-colors hover:bg-card-hover">
                      <td className={cn("px-2 py-2", stickyExpandCell)}>
                        <button
                          type="button"
                          onClick={() => toggle(productKey)}
                          className="rounded p-1 text-muted-foreground hover:bg-card-hover hover:text-foreground"
                          aria-label={isOpen ? "Collapse SKU rows" : "Expand SKU rows"}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 font-mono text-xs font-medium text-primary",
                          stickyModelCell
                        )}
                      >
                        {row.supplierArticle}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2" title={row.productName}>
                        {row.productName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Link
                          href={inventoryHref(productKey)}
                          className="font-medium text-primary hover:underline"
                          title="Open in Inventory"
                        >
                          {formatNumber(row.currentStock)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.orders)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.purchases)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatPercent(row.conversionPercent)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(row.marketplaceFees)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        <LogisticsBreakdownHint
                          totalLogistics={row.totalLogistics}
                          purchaseLogistics={row.purchaseLogistics}
                          excludedLogistics={row.excludedLogistics}
                          returnLogistics={row.returnLogistics}
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(row.productCost)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-medium tabular-nums",
                          variant === "success" && "text-success",
                          variant === "danger" && "text-danger",
                          variant === "warning" && "text-amber-500"
                        )}
                      >
                        {formatCurrency(row.operationalProfit)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          variant === "success" && "text-success",
                          variant === "danger" && "text-danger",
                          variant === "warning" && "text-amber-500",
                          variant === "muted" && "text-muted-foreground"
                        )}
                      >
                        {formatPercent(row.operationalMarginPercent)}
                      </td>
                    </tr>
                    <SkuChildRows
                      productId={productKey}
                      from={rangeFrom}
                      to={rangeTo}
                      isOpen={isOpen}
                      colSpan={parentColSpan}
                    />
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
