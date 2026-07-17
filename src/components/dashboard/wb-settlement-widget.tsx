"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { SettlementUnavailableNotice } from "@/components/dashboard/settlement-unavailable-notice";
import { DEFAULT_TAX_PERCENT } from "@/lib/smart-pricing-constants";
import { loadSmartPricingUiSettings } from "@/lib/smart-pricing-ui-settings";
import { cn, formatCurrency } from "@/lib/utils";
import type { WbSettlementMetrics } from "@/types/database";

type WbSettlementWidgetProps = {
  settlement: WbSettlementMetrics;
  isEmptyPeriod?: boolean;
};

/**
 * WB Settlement display — settlement mathematics unchanged.
 * Estimated Tax / After Tax Payout are presentation-only under Seller Payout (netForPay).
 */
export function WbSettlementWidget({
  settlement,
  isEmptyPeriod = false,
}: WbSettlementWidgetProps) {
  const unavailable = settlement.availability?.available === false;
  const [taxPercent, setTaxPercent] = useState(DEFAULT_TAX_PERCENT);

  useEffect(() => {
    const saved = loadSmartPricingUiSettings();
    setTaxPercent(saved.taxPercent);
  }, []);

  const formatMoney = (value: number) =>
    isEmptyPeriod || unavailable ? "—" : formatCurrency(value);

  const sellerPayout = settlement.netForPay;
  const estimatedTax =
    !isEmptyPeriod && !unavailable && sellerPayout > 0 && taxPercent > 0
      ? sellerPayout * (taxPercent / 100)
      : 0;
  const afterTaxPayout = sellerPayout - estimatedTax;

  const sourceLabel =
    settlement.dataSource === "finance_transaction"
      ? "Finance Transactions"
      : "Weekly WB Reports";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold">WB Settlement</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Wildberries payment entitlement</p>
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
                    : settlement.settlement >= 0
                      ? "text-success"
                      : "text-danger"
                )}
              >
                {formatMoney(settlement.settlement)}
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
          <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Seller Payout</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(sellerPayout)}</dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Estimated Tax</dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(estimatedTax)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-primary/5 px-3 py-2">
              <dt className="text-muted-foreground">After Tax Payout</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(afterTaxPayout)}</dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Logistics</dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(settlement.logistics)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Storage</dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(settlement.storage)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Penalties</dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(settlement.penalties)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Deductions</dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(settlement.deductions)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg bg-muted/20 px-3 py-2">
              <dt className="text-muted-foreground">Acceptance</dt>
              <dd className="font-medium tabular-nums text-danger">
                −{formatCurrency(settlement.acceptance)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Estimated Tax and After Tax Payout are informational ({taxPercent}% of Seller
            Payout). Settlement mathematics are unchanged. Product Cost is not shown.
          </p>
        </div>
      )}
    </div>
  );
}
