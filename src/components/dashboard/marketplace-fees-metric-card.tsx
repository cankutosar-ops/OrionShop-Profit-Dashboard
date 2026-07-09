"use client";

import { Receipt } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

const MARKETPLACE_FEES_TOOLTIP =
  "Total fees and deductions charged by Wildberries during the selected period.";

const ACCOUNT_ADJUSTMENTS_TOOLTIP =
  "Includes account-level adjustments recorded by Wildberries.";

type MarketplaceFeesMetricCardProps = {
  /** Total marketplace fees (commission + all other-bucket deductions). */
  totalMarketplaceFees: number;
  accountAdjustments: number;
  isEmptyPeriod?: boolean;
};

export function MarketplaceFeesMetricCard({
  totalMarketplaceFees,
  accountAdjustments,
  isEmptyPeriod = false,
}: MarketplaceFeesMetricCardProps) {
  const formatMoney = (value: number) => (isEmptyPeriod ? "—" : formatCurrency(value));

  return (
    <div className="group/card relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:bg-card-hover">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="group/title relative inline-block text-sm font-medium text-muted-foreground">
            <span className="cursor-help border-b border-dotted border-transparent group-hover/title:border-muted-foreground/50">
              Marketplace Fees
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-56 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-muted-foreground shadow-lg group-hover/title:block"
            >
              {MARKETPLACE_FEES_TOOLTIP}
            </span>
          </p>
          <p className="text-2xl font-bold tracking-tight">{formatMoney(totalMarketplaceFees)}</p>
          {!isEmptyPeriod && accountAdjustments > 0 && (
            <p className="group/adj relative inline-block text-xs text-muted-foreground">
              <span className="cursor-help border-b border-dotted border-muted-foreground/40">
                Includes {formatMoney(-accountAdjustments)} Account Adjustments
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-56 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-normal normal-case tracking-normal text-muted-foreground shadow-lg group-hover/adj:block"
              >
                {ACCOUNT_ADJUSTMENTS_TOOLTIP}
              </span>
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br",
            "from-warning/20 to-warning/5 text-warning"
          )}
        >
          <Receipt className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
