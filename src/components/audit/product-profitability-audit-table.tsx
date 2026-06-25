import type { ProductProfitabilityAuditRow } from "@/types/database";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductProfitabilityAuditTableProps = {
  rows: ProductProfitabilityAuditRow[];
  totals: ProductProfitabilityAuditRow;
};

function AuditCell({
  value,
  className,
  variant,
}: {
  value: string;
  className?: string;
  variant?: "default" | "success" | "danger" | "muted";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-right tabular-nums",
        variant === "success" && "text-success",
        variant === "danger" && "text-danger",
        variant === "muted" && "text-muted-foreground",
        className
      )}
    >
      {value}
    </td>
  );
}

function profitVariant(value: number): "success" | "danger" {
  return value >= 0 ? "success" : "danger";
}

export function ProductProfitabilityAuditTable({
  rows,
  totals,
}: ProductProfitabilityAuditTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Top {rows.length} by revenue</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Grouped by product_id · wb_finance fees allocated per product
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">Article</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 text-right font-medium">Revenue</th>
              <th className="px-4 py-3 text-right font-medium">Qty Sold</th>
              <th className="px-4 py-3 text-right font-medium">Commission</th>
              <th className="px-4 py-3 text-right font-medium">Logistics</th>
              <th className="px-4 py-3 text-right font-medium">Return Log.</th>
              <th className="px-4 py-3 text-right font-medium">Deductions</th>
              <th className="px-4 py-3 text-right font-medium">Product Cost</th>
              <th className="px-4 py-3 text-right font-medium">Gross Profit</th>
              <th className="px-4 py-3 text-right font-medium">Net Profit</th>
              <th className="px-4 py-3 text-right font-medium">Margin %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-12 text-center text-muted-foreground">
                  No product sales in the selected period
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.productId}
                  className="border-b border-border/50 transition-colors hover:bg-card-hover"
                >
                  <td className="sticky left-0 z-10 bg-card px-4 py-3 font-mono text-xs font-medium text-primary">
                    {row.supplierArticle}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3" title={row.productName}>
                    {row.productName}
                  </td>
                  <AuditCell value={formatCurrency(row.revenue)} className="font-medium" />
                  <AuditCell value={formatNumber(row.quantitySold)} variant="muted" />
                  <AuditCell value={formatCurrency(row.commission)} variant="muted" />
                  <AuditCell value={formatCurrency(row.logistics)} variant="muted" />
                  <AuditCell value={formatCurrency(row.returnLogistics)} variant="muted" />
                  <AuditCell value={formatCurrency(row.deductions)} variant="muted" />
                  <AuditCell value={formatCurrency(row.productCost)} variant="muted" />
                  <AuditCell
                    value={formatCurrency(row.grossProfit)}
                    variant={profitVariant(row.grossProfit)}
                  />
                  <AuditCell
                    value={formatCurrency(row.netProfit)}
                    variant={profitVariant(row.netProfit)}
                    className="font-medium"
                  />
                  <AuditCell value={formatPercent(row.marginPercent)} variant="muted" />
                </tr>
              ))
            )}
            {rows.length > 0 && (
              <tr className="border-t border-border bg-primary/5 font-semibold">
                <td className="sticky left-0 z-10 bg-primary/5 px-4 py-3" colSpan={2}>
                  {totals.productName}
                </td>
                <AuditCell value={formatCurrency(totals.revenue)} />
                <AuditCell value={formatNumber(totals.quantitySold)} />
                <AuditCell value={formatCurrency(totals.commission)} />
                <AuditCell value={formatCurrency(totals.logistics)} />
                <AuditCell value={formatCurrency(totals.returnLogistics)} />
                <AuditCell value={formatCurrency(totals.deductions)} />
                <AuditCell value={formatCurrency(totals.productCost)} />
                <AuditCell
                  value={formatCurrency(totals.grossProfit)}
                  variant={profitVariant(totals.grossProfit)}
                />
                <AuditCell
                  value={formatCurrency(totals.netProfit)}
                  variant={profitVariant(totals.netProfit)}
                />
                <AuditCell value={formatPercent(totals.marginPercent)} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
