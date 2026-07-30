"use client";

import { useState } from "react";
import { ChevronRight, Landmark } from "lucide-react";
import { SettlementUnavailableNotice } from "@/components/dashboard/settlement-unavailable-notice";
import { cn, formatCurrency } from "@/lib/utils";
import type { WbSettlementMetrics } from "@/types/database";

type WbSettlementWidgetProps = {
  settlement: WbSettlementMetrics;
  isEmptyPeriod?: boolean;
  /**
   * Financial Engine Estimated Tax for the same date range
   * (Tax% × Σ finishedPrice). Never computed from Settlement.
   */
  estimatedTax?: number;
  taxPercent?: number;
};

/**
 * WB Settlement display — cash-flow-first presentation.
 * Settlement mathematics unchanged. Estimated Tax / Cash After Tax reuse
 * Financial Engine tax (finishedPrice base) — informational only vs Settlement.
 */
export function WbSettlementWidget({
  settlement,
  isEmptyPeriod = false,
  estimatedTax = 0,
  taxPercent = 6,
}: WbSettlementWidgetProps) {
  const unavailable = settlement.availability?.available === false;
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const formatMoney = (value: number) =>
    isEmptyPeriod || unavailable ? "—" : formatCurrency(value);

  const wbSettlementAmount = settlement.settlement;
  const taxAmount =
    !isEmptyPeriod && !unavailable && Number.isFinite(estimatedTax) ? estimatedTax : 0;
  const estimatedCashAfterTax = wbSettlementAmount - taxAmount;

  const sourceLabel =
    settlement.dataSource === "finance_transaction"
      ? "Finance Transactions"
      : "Weekly WB Reports";

  const breakdownRows: { label: string; value: number; negative?: boolean }[] = [
    { label: "Seller Payout", value: settlement.netForPay },
    { label: "Logistics", value: settlement.logistics, negative: true },
    { label: "Storage", value: settlement.storage, negative: true },
    { label: "Penalties", value: settlement.penalties, negative: true },
    { label: "Acceptance", value: settlement.acceptance, negative: true },
    { label: "Deductions", value: settlement.deductions, negative: true },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">WB Settlement</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Wildberries will transfer this amount.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Calculated for the currently selected date range.
            </p>
          </div>
          {!unavailable && (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                WB Settlement
              </p>
              <p
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  isEmptyPeriod
                    ? "text-foreground"
                    : wbSettlementAmount >= 0
                      ? "text-success"
                      : "text-danger"
                )}
              >
                {formatMoney(wbSettlementAmount)}
              </p>
              {!isEmptyPeriod && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Source:
                  <br />
                  <span className="font-medium text-foreground">{sourceLabel}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {!isEmptyPeriod && unavailable && settlement.availability && (
        <div className="px-6 py-4">
          <SettlementUnavailableNotice availability={settlement.availability} />
        </div>
      )}

      {!isEmptyPeriod && !unavailable && (
        <div className="px-6 py-4">
          {settlement.dataSourceNote && (
            <p className="mb-3 text-xs text-warning">{settlement.dataSourceNote}</p>
          )}

          {/* Linear cash-flow story */}
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2.5">
              <dt className="text-muted-foreground">
                Estimated Tax
                <span className="ml-1 text-xs tabular-nums">({taxPercent}%)</span>
              </dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(Math.abs(taxAmount))}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg bg-primary/5 px-3 py-2.5">
              <dt className="font-medium text-foreground">Estimated Cash After Tax</dt>
              <dd
                className={cn(
                  "text-base font-semibold tabular-nums",
                  estimatedCashAfterTax >= 0 ? "text-success" : "text-danger"
                )}
              >
                {formatCurrency(estimatedCashAfterTax)}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Estimated Tax = {taxPercent}% × Σ finishedPrice (Financial Engine — same as
            Commercial Performance). Wildberries still transfers the full Settlement amount.
            Cash After Tax is informational only and is not part of the Settlement calculation.
          </p>

          {/* Secondary: settlement component breakdown */}
          <div className="mt-4 border-t border-border pt-3">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-md py-1 text-left text-sm font-medium text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-expanded={breakdownOpen}
              onClick={() => setBreakdownOpen((open) => !open)}
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                  breakdownOpen && "rotate-90"
                )}
                aria-hidden
              />
              Settlement Breakdown
            </button>

            {breakdownOpen && (
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {breakdownRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd
                      className={cn(
                        "font-medium tabular-nums",
                        row.negative && "text-danger"
                      )}
                    >
                      {row.negative
                        ? `−${formatCurrency(row.value)}`
                        : formatCurrency(row.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
