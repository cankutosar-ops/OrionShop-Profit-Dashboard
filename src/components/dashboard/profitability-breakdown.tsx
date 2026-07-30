"use client";

import { useMemo } from "react";
import {
  buildModelBBreakdownLines,
  shareOfNetSalesPercent,
} from "@/lib/financial-engine";
import { isNetSalesReady } from "@/lib/sales-revenue-resolution";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { ModelBProfitMetrics } from "@/types/database";

type ProfitabilityBreakdownProps = {
  modelB: ModelBProfitMetrics;
  isEmptyPeriod?: boolean;
};

/**
 * Commercial Performance profitability breakdown — Net Profit matches Dashboard KPI.
 * Marketplace Fee / Acquiring are informational (not deducted again).
 */
export function ProfitabilityBreakdown({
  modelB,
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
                  (line.key === "marketplaceFee" ||
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
    </div>
  );
}
