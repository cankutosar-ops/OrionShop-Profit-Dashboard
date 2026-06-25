"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { LogisticsBreakdownHint } from "@/components/analytics/logistics-breakdown-hint";
import { useProductSkuAnalytics } from "@/hooks/use-product-sku-analytics";
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
              <table className="w-full max-w-xl text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Size</th>
                    <th className="px-2 py-1.5 font-medium">Barcode</th>
                    <th className="px-2 py-1.5 text-right font-medium">Current Stock</th>
                    <th className="px-2 py-1.5 text-right font-medium">Orders</th>
                    <th className="px-2 py-1.5 text-right font-medium">Purchases</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skus.map((sku) => (
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
  return (
    <tr className="border-t border-border/40">
      <td className="px-2 py-2 font-medium">{sku.size}</td>
      <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{sku.barcode ?? "—"}</td>
      <td className="px-2 py-2 text-right tabular-nums">{formatNumber(sku.currentStock)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatNumber(sku.orders)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
        {formatNumber(sku.purchases)}
      </td>
    </tr>
  );
}

export function ProductAnalyticsV8Table({
  title,
  description,
  rows,
  rangeFrom,
  rangeTo,
}: ProductAnalyticsV8TableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (productId: string) => {
    const key = String(productId);
    setExpanded((current) => ({ ...current, [key]: !current[key] }));
  };

  const expandedCount = useMemo(
    () => Object.values(expanded).filter(Boolean).length,
    [expanded]
  );
  const parentColSpan = 14;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        {expandedCount > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {expandedCount} model(s) expanded · SKU data cached via React Query
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 font-medium">Model</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 text-right font-medium">Orders</th>
              <th className="px-3 py-2 text-right font-medium">Purchases</th>
              <th className="px-3 py-2 text-right font-medium">Conv. %</th>
              <th className="px-3 py-2 text-right font-medium">Cancelled</th>
              <th className="px-3 py-2 text-right font-medium">Cancel. %</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Commission</th>
              <th className="px-3 py-2 text-right font-medium">Total Logistics</th>
              <th className="px-3 py-2 text-right font-medium">Product Cost</th>
              <th className="px-3 py-2 text-right font-medium">Oper. Profit</th>
              <th className="px-3 py-2 text-right font-medium">Oper. Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={parentColSpan} className="px-4 py-8 text-center text-muted-foreground">
                  No product data for the selected period
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const productKey = String(row.productId);
                const isOpen = Boolean(expanded[productKey]);
                const variant = operationalVariant(row.operationalMarginPercent);

                return (
                  <Fragment key={productKey}>
                    <tr className="border-b border-border/50 transition-colors hover:bg-card-hover">
                      <td className="px-2 py-2">
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
                      <td className="px-3 py-2 font-mono text-xs font-medium text-primary">
                        {row.supplierArticle}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2" title={row.productName}>
                        {row.productName}
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
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatNumber(row.cancelled)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatPercent(row.cancellationPercent)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatCurrency(row.commission)}
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
