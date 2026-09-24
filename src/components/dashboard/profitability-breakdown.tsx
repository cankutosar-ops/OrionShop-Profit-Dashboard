"use client";

import { useMemo } from "react";
import {
  buildModelBBreakdownLines,
  shareOfNetSalesPercent,
} from "@/lib/financial-engine";
import { isNetSalesReady } from "@/lib/sales-revenue-resolution";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { ModelBProfitMetrics } from "@/types/database";
import type { MarketplaceFeesPresentation } from "@/types/finance";

type ProfitabilityBreakdownProps = {
  modelB: ModelBProfitMetrics;
  marketplaceFees: MarketplaceFeesPresentation;
  isEmptyPeriod?: boolean;
};

/**
 * Commercial Performance profitability breakdown — Net Profit matches Dashboard KPI.
 * Marketplace Fees / Acquiring are informational (not deducted again).
 */
export function ProfitabilityBreakdown({
  modelB,
  marketplaceFees,
  isEmptyPeriod = false,
}: ProfitabilityBreakdownProps) {
  const revenueReady = isNetSalesReady(modelB.netSalesStatus);

  const { breakdown, salesBase } = useMemo(
    () => ({
      breakdown: buildModelBBreakdownLines(modelB),
      salesBase: modelB.revenue,
    }),
    [modelB]
  );

  const shareOfBase = (amount: number, isTotal?: boolean) => {
    if (isTotal) return "—";
    if (isEmptyPeriod || !revenueReady) return "—";
    if (salesBase <= 0) return "—";
    return formatPercent(shareOfNetSalesPercent(salesBase, amount));
  };

  const formatAmount = (amount: number, isDeduction?: boolean) => {
    if (isEmptyPeriod || !revenueReady) return "—";
    const prefix = isDeduction ? "−" : "";
    return `${prefix}${formatCurrency(amount)}`;
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h3 className="text-base font-semibold">Profitability Breakdown</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Commercial Performance V4 — Revenue = Finance ppvz_for_pay
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
            {breakdown.map((line) => (
              <tr
                key={line.key}
                className={cn(
                  "border-b border-border/50",
                  line.isTotal && "bg-primary/5 font-semibold",
                  (line.key === "salesToSettlementDifference" ||
                    line.key === "acquiring" ||
                    line.key === "marketplaceFees") &&
                    "text-muted-foreground"
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
                  {formatAmount(line.amount, line.isDeduction)}
                </td>
                <td className="px-6 py-3.5 text-right text-muted-foreground tabular-nums">
                  {shareOfBase(line.amount, line.isTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 border-b border-border bg-muted/20 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <FeeItem label="Marketplace Fees" value={marketplaceFees.marketplaceFees} />
        <FeeItem label="WB Commission" value={marketplaceFees.commission} />
        <FeeItem
          label="Acquiring (informational)"
          value={marketplaceFees.acquiring}
          note="Finance acquiring fee. Included in Marketplace Fees and already reflected before Revenue; shown for information only."
        />
        <FeeItem label="WB Reward / Service" value={marketplaceFees.ppvzReward} />
        <FeeItem label="WB Remuneration base" value={marketplaceFees.ppvzVw} />
        <FeeItem label="WB Remuneration VAT" value={marketplaceFees.ppvzVwNds} />
        <FeeItem
          label="WB Remuneration (signed)"
          value={marketplaceFees.wbRemuneration}
          note={
            marketplaceFees.wbRemunerationStatus === "AVAILABLE"
              ? `${formatPercent(marketplaceFees.wbRemunerationPercent ?? 0)} of Net Sales`
              : marketplaceFees.wbRemunerationStatus === "LEGACY_RAW_UNAVAILABLE"
                ? "Legacy signed raw values unavailable"
                : "No Finance evidence"
          }
        />
        <FeeItem
          label="Sales-to-Settlement Difference"
          value={marketplaceFees.salesToSettlementDifference}
          note="Reconciliation only"
        />
      </div>
    </div>
  );
}

function FeeItem({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium tabular-nums">
        {value == null ? "Unavailable" : formatCurrency(value)}
      </div>
      {note && <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}
