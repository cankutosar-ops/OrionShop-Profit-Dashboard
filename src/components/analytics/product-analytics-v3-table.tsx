import type { ProductAnalyticsV3Row } from "@/types/database";
import { LogisticsBreakdownHint } from "@/components/analytics/logistics-breakdown-hint";
import { getOperationalMarginBand } from "@/lib/product-operational-metrics";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductAnalyticsV3TableProps = {
  title: string;
  description?: string;
  rows: ProductAnalyticsV3Row[];
  /** full = All Products (product column, dense full-width); compact = ranked top/bottom lists */
  layout?: "full" | "compact";
};

function operationalVariant(marginPercent: number): "success" | "warning" | "danger" | "muted" {
  const band = getOperationalMarginBand(marginPercent);
  if (band === "strong") return "success";
  if (band === "healthy") return "muted";
  if (band === "weak") return "warning";
  return "danger";
}

const stickySkuHeader =
  "sticky left-0 z-20 min-w-[6.5rem] bg-card border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]";
const stickySkuCell =
  "sticky left-0 z-20 min-w-[6.5rem] bg-card group-hover:bg-card-hover border-r border-border/60 shadow-[4px_0_8px_-4px_hsl(var(--border))]";

export function ProductAnalyticsV3Table({
  title,
  description,
  rows,
  layout = "compact",
}: ProductAnalyticsV3TableProps) {
  const isFull = layout === "full";
  const colSpan = isFull ? 13 : 12;
  const cellPad = isFull ? "px-3 py-2" : "px-4 py-2.5";
  const headPad = isFull ? "px-3 py-2" : "px-4 py-2.5";

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
      <div className={cn("border-b border-border", isFull ? "px-4 py-2.5" : "px-4 py-3")}>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", isFull && "min-w-full table-fixed", !isFull && "min-w-[960px]")}>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className={cn(headPad, "font-medium", stickySkuHeader)}>SKU</th>
              {isFull && (
                <th className={cn(headPad, "w-[16%] font-medium")}>Product</th>
              )}
              <th className={cn(headPad, "w-[6%] text-right font-medium")}>Orders</th>
              <th className={cn(headPad, "w-[6%] text-right font-medium")}>Purchases</th>
              <th className={cn(headPad, "w-[6%] text-right font-medium")}>Conv. %</th>
              <th className={cn(headPad, "w-[6%] text-right font-medium")}>Cancelled</th>
              <th className={cn(headPad, "w-[6%] text-right font-medium")}>Cancel. %</th>
              <th className={cn(headPad, "w-[8%] text-right font-medium")}>Revenue</th>
              <th className={cn(headPad, "w-[8%] text-right font-medium")}>Commission</th>
              <th className={cn(headPad, "w-[8%] text-right font-medium")}>Total Logistics</th>
              <th className={cn(headPad, "w-[8%] text-right font-medium")}>Product Cost</th>
              <th className={cn(headPad, "w-[8%] text-right font-medium")}>Oper. Profit</th>
              <th className={cn(headPad, "w-[5%] text-right font-medium")}>Oper. Margin</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  No product data for the selected period
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const variant = operationalVariant(row.operationalMarginPercent);
                return (
                  <tr
                    key={row.productId}
                    className="group border-b border-border/50 transition-colors hover:bg-card-hover"
                  >
                    <td
                      className={cn(
                        cellPad,
                        "font-mono text-xs font-medium text-primary",
                        !isFull && "whitespace-nowrap",
                        stickySkuCell
                      )}
                      title={row.productName}
                    >
                      {row.supplierArticle}
                    </td>
                    {isFull && (
                      <td className={cn(cellPad, "truncate")} title={row.productName}>
                        {row.productName}
                      </td>
                    )}
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatNumber(row.orders)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatNumber(row.purchases)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatPercent(row.conversionPercent)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatNumber(row.cancelled)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatPercent(row.cancellationPercent)}
                    </td>
                    <td className={cn(cellPad, "text-right font-medium tabular-nums")}>
                      {formatCurrency(row.revenue)}
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatCurrency(row.commission)}
                    </td>
                    <td className={cn(cellPad, "text-right tabular-nums text-muted-foreground")}>
                      <LogisticsBreakdownHint
                        totalLogistics={row.totalLogistics}
                        purchaseLogistics={row.purchaseLogistics}
                        excludedLogistics={row.excludedLogistics}
                        returnLogistics={row.returnLogistics}
                      />
                    </td>
                    <td className={cn(cellPad, "text-right text-muted-foreground tabular-nums")}>
                      {formatCurrency(row.productCost)}
                    </td>
                    <td
                      className={cn(
                        cellPad,
                        "text-right font-medium tabular-nums",
                        variant === "success" && "text-success",
                        variant === "danger" && "text-danger",
                        variant === "warning" && "text-amber-500"
                      )}
                    >
                      {formatCurrency(row.operationalProfit)}
                    </td>
                    <td
                      className={cn(
                        cellPad,
                        "text-right tabular-nums",
                        variant === "success" && "text-success",
                        variant === "danger" && "text-danger",
                        variant === "warning" && "text-amber-500",
                        variant === "muted" && "text-muted-foreground"
                      )}
                    >
                      {formatPercent(row.operationalMarginPercent)}
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
