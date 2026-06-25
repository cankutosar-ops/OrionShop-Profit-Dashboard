import type { ProfitabilityV2Metrics } from "@/types/database";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type ProfitabilityBreakdownProps = {
  metrics: ProfitabilityV2Metrics;
  revenue: number;
};

export function ProfitabilityBreakdown({ metrics, revenue }: ProfitabilityBreakdownProps) {
  const shareOfRevenue = (amount: number) =>
    revenue > 0 ? formatPercent((amount / revenue) * 100) : "—";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Profitability Breakdown</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Product cost from latest active cost per supplier article
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Line Item</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">% of Revenue</th>
            </tr>
          </thead>
          <tbody>
            {metrics.breakdown.map((line) => (
              <tr
                key={line.key}
                className={cn(
                  "border-b border-border/50",
                  line.isTotal && "bg-primary/5 font-semibold"
                )}
              >
                <td className="px-6 py-3.5">
                  <div>{line.label}</div>
                  {line.detail && (
                    <div className="text-xs text-muted-foreground">{line.detail}</div>
                  )}
                </td>
                <td
                  className={cn(
                    "px-6 py-3.5 text-right font-medium tabular-nums",
                    line.isDeduction && "text-danger",
                    line.isTotal && line.amount >= 0 && "text-success",
                    line.isTotal && line.amount < 0 && "text-danger"
                  )}
                >
                  {line.isDeduction ? "−" : ""}
                  {formatCurrency(line.amount)}
                </td>
                <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                  {line.isTotal ? "—" : shareOfRevenue(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {metrics.advertising > 0 && (
        <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
          Net profit also deducts advertising ({formatCurrency(metrics.advertising)}) from wb_ads,
          separate from marketplace fees.
        </div>
      )}
    </div>
  );
}
