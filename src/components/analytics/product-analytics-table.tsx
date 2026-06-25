import type { ProductAnalyticsRow } from "@/types/database";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductAnalyticsTableProps = {
  title: string;
  description?: string;
  rows: ProductAnalyticsRow[];
  compact?: boolean;
};

function profitVariant(value: number): "success" | "danger" {
  return value >= 0 ? "success" : "danger";
}

export function ProductAnalyticsTable({
  title,
  description,
  rows,
  compact = false,
}: ProductAnalyticsTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Article</th>
              {!compact && <th className="px-6 py-3 font-medium">Product</th>}
              <th className="px-6 py-3 text-right font-medium">Revenue</th>
              <th className="px-6 py-3 text-right font-medium">Qty Sold</th>
              <th className="px-6 py-3 text-right font-medium">Product Cost</th>
              <th className="px-6 py-3 text-right font-medium">Marketplace Fees</th>
              <th className="px-6 py-3 text-right font-medium">Net Profit</th>
              <th className="px-6 py-3 text-right font-medium">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={compact ? 7 : 8}
                  className="px-6 py-12 text-center text-muted-foreground"
                >
                  No product data for the selected period
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.productId}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td
                    className="px-6 py-3.5 font-mono text-xs font-medium text-primary"
                    title={row.productName}
                  >
                    {row.supplierArticle}
                  </td>
                  {!compact && (
                    <td className="max-w-[220px] truncate px-6 py-3.5" title={row.productName}>
                      {row.productName}
                    </td>
                  )}
                  <td className="px-6 py-3.5 text-right font-medium tabular-nums">
                    {formatCurrency(row.revenue)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatNumber(row.quantitySold)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatCurrency(row.productCost)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatCurrency(row.marketplaceFees)}
                  </td>
                  <td
                    className={cn(
                      "px-6 py-3.5 text-right font-medium tabular-nums",
                      profitVariant(row.netProfit)
                    )}
                  >
                    {formatCurrency(row.netProfit)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                    {formatPercent(row.marginPercent)}
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
