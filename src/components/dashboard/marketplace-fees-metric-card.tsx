"use client";

import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCurrency } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";

const MARKETPLACE_FEES_TOOLTIP =
  "Per-sale marketplace costs: commission, acquiring, PPVZ reward/VW, and other marketplace expenses. Account adjustments are shown separately.";

type MarketplaceFeesMetricCardProps = {
  /** Total Marketplace Fees for the period (excludes account adjustments). */
  totalMarketplaceFees: number;
  /** Commission component — informational secondary line only. */
  commission: number;
  isEmptyPeriod?: boolean;
};

/** Specialized KPI — inherits MetricCard language. */
export function MarketplaceFeesMetricCard({
  totalMarketplaceFees,
  commission,
  isEmptyPeriod = false,
}: MarketplaceFeesMetricCardProps) {
  const formatMoney = (value: number) => (isEmptyPeriod ? "—" : formatKpiCurrency(value));

  return (
    <MetricCard
      title="Marketplace Fees"
      value={formatMoney(totalMarketplaceFees)}
      subtitle={!isEmptyPeriod ? `Fee detail ${formatMoney(commission)}` : undefined}
      icon={KPI_ICONS.tax}
      variant="warning"
      hint={MARKETPLACE_FEES_TOOLTIP}
    />
  );
}
