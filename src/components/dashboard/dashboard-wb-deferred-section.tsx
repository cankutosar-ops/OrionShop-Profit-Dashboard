import type { ReactNode } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { WbSettlementWidget } from "@/components/dashboard/wb-settlement-widget";
import { formatKpiCount, formatKpiCurrency } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { sanitizeUnavailableReason } from "@/lib/user-facing-errors";
import { loadDashboardWbStrip } from "@/services/dashboard-service";
import type { ScopedDateRange } from "@/types/database";
function KpiSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Deferred WB KPIs + settlement — does not block Model B critical path. */
export async function DashboardWbDeferredSection({
  scope,
  isEmptyPeriod,
  totalOrdersCount,
  ordersCount,
  ordersValueCount,
  estimatedTax = 0,
  taxPercent = 6,
}: {
  scope: ScopedDateRange;
  isEmptyPeriod: boolean;
  totalOrdersCount: number;
  ordersCount: number;
  ordersValueCount: number;
  /** Financial Engine Estimated Tax (finishedPrice base) for the same range. */
  estimatedTax?: number;
  taxPercent?: number;
}) {
  const strip = await loadDashboardWbStrip(scope);
  const emptyValue = "—";
  const formatMoney = (value: number) => (isEmptyPeriod ? emptyValue : formatKpiCurrency(value));

  if (!strip) {
    return null;
  }

  const expectedWbPayout = strip.expectedWbPayout;
  const expectedWbPayoutValue =
    isEmptyPeriod || expectedWbPayout.amount === null
      ? emptyValue
      : formatKpiCurrency(expectedWbPayout.amount);
  const expectedWbPayoutSubtitle =
    isEmptyPeriod || expectedWbPayout.amount === null
      ? sanitizeUnavailableReason(
          expectedWbPayout.unavailableReason,
          "Settlement by report period"
        )
      : expectedWbPayout.reportCount > 0
        ? `${expectedWbPayout.reportCount} report${expectedWbPayout.reportCount === 1 ? "" : "s"} in range`
        : "No reports overlap selected period";

  const wbBalance = strip.wbBalance;
  const wbBalanceValue =
    isEmptyPeriod || wbBalance.current === null
      ? emptyValue
      : formatKpiCurrency(wbBalance.current);
  const wbBalanceSubtitle =
    isEmptyPeriod || wbBalance.current === null
      ? sanitizeUnavailableReason(wbBalance.unavailableReason, "Wildberries wallet balance")
      : wbBalance.forWithdraw !== null
        ? `Available to withdraw ${formatKpiCurrency(wbBalance.forWithdraw)}`
        : "Total wallet balance (WB Finance API)";

  const ordersValueSubtitle = isEmptyPeriod
    ? emptyValue
    : `${formatKpiCount(totalOrdersCount)} orders incl. cancelled · ${formatKpiCount(ordersValueCount)} items`;

  return (
    <div className="space-y-8">
      <KpiSection
        title="Wildberries KPIs"
        description="Order pipeline, expected settlement, and current wallet balance"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Orders Value"
            value={formatMoney(strip.ordersValue)}
            subtitle={ordersValueSubtitle}
            icon={KPI_ICONS.orders}
            variant="default"
          />
          <MetricCard
            title="Expected WB Payout"
            value={expectedWbPayoutValue}
            subtitle={expectedWbPayoutSubtitle}
            icon={KPI_ICONS.settlement}
            variant={
              isEmptyPeriod || expectedWbPayout.amount === null
                ? "default"
                : expectedWbPayout.amount > 0
                  ? "success"
                  : "default"
            }
          />
          <MetricCard
            title="Wallet Balance"
            value={wbBalanceValue}
            subtitle={wbBalanceSubtitle}
            icon={KPI_ICONS.wallet}
            variant={
              isEmptyPeriod || wbBalance.current === null
                ? "default"
                : wbBalance.current > 0
                  ? "success"
                  : "default"
            }
          />
        </div>
      </KpiSection>

      <WbSettlementWidget
        settlement={strip.wbSettlement}
        isEmptyPeriod={isEmptyPeriod}
        estimatedTax={estimatedTax}
        taxPercent={taxPercent}
      />
    </div>
  );
}

export function DashboardWbSectionFallback() {
  return (
    <div className="space-y-8">
      <KpiSection
        title="Wildberries KPIs"
        description="Loading Wildberries settlement and balance…"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
        </div>
      </KpiSection>
      <div className="h-40 animate-pulse rounded-xl bg-muted/30" />
    </div>
  );
}
