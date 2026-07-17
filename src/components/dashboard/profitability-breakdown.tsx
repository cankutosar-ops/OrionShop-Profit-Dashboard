"use client";

import { useMemo } from "react";
import {
  buildModelBBreakdownLines,
  shareOfNetSalesPercent,
} from "@/lib/profit-engine-model-b";
import { isNetSalesReady } from "@/lib/sales-revenue-resolution";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { ModelBProfitMetrics } from "@/types/database";

type ProfitabilityBreakdownProps = {
  modelB: ModelBProfitMetrics;
  isEmptyPeriod?: boolean;
};

/**
 * Model B profitability breakdown — Final Net Profit matches Dashboard KPI.
 * Tax is applied to Seller Payout only; Product Cost / Advertising after tax.
 */
export function ProfitabilityBreakdown({
  modelB,
  isEmptyPeriod = false,
}: ProfitabilityBreakdownProps) {
  const revenueReady = isNetSalesReady(modelB.netSalesStatus);

  const { breakdown, salesBase } = useMemo(
    () => ({
      breakdown: buildModelBBreakdownLines(modelB),
      salesBase: modelB.sellerPayout,
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
          Model B commercial flow — Estimated Tax from Seller Payout only
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-6 py-3 font-medium">Line Item</th>
              <th className="px-6 py-3 text-right font-medium">Amount</th>
              <th className="px-6 py-3 text-right font-medium">% of Seller Payout</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((line) => (
              <tr
                key={line.key}
                className={cn(
                  "border-b border-border/50",
                  line.isTotal && "bg-primary/5 font-semibold",
                  (line.key === "marketplaceFees" ||
                    line.key === "logistics" ||
                    line.key === "storage" ||
                    line.key === "penalties" ||
                    line.key === "adjustments") &&
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
                    line.isTotal && line.amount < 0 && "text-danger",
                    line.key === "marketplaceFees" && "text-foreground"
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
    </div>
  );
}
