"use client";

import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCurrency } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import type { NetSalesStatus } from "@/lib/sales-revenue-resolution";
import { isNetSalesReady } from "@/lib/sales-revenue-resolution";
import { TEMPORARILY_UNAVAILABLE } from "@/lib/user-facing-errors";

type NetSalesMetricCardProps = {
  grossSales: number;
  returnedSales: number;
  netSales: number;
  netSalesStatus: NetSalesStatus;
  isEmptyPeriod?: boolean;
};

/** Specialized KPI — inherits MetricCard language. */
export function NetSalesMetricCard({
  grossSales,
  returnedSales,
  netSales,
  netSalesStatus,
  isEmptyPeriod = false,
}: NetSalesMetricCardProps) {
  const revenueReady = isNetSalesReady(netSalesStatus);
  const isUnavailable = netSalesStatus === "unavailable";

  const formatMoney = (value: number) => (isEmptyPeriod ? "—" : formatKpiCurrency(value));

  const primaryValue = isEmptyPeriod
    ? "—"
    : isUnavailable
      ? TEMPORARILY_UNAVAILABLE
      : formatKpiCurrency(netSales);

  const subtitle =
    !isEmptyPeriod && revenueReady ? (
      <div className="space-y-0.5">
        <p>Gross Sales {formatMoney(grossSales)}</p>
        <p>Returned Sales {formatMoney(returnedSales)}</p>
        <p className="font-medium text-muted-foreground/90">
          Net Sales {formatMoney(netSales)}
        </p>
      </div>
    ) : !isEmptyPeriod && isUnavailable ? (
      "Revenue data is being synchronized"
    ) : undefined;

  return (
    <MetricCard
      title="Net Sales (priceWithDisc)"
      value={primaryValue}
      subtitle={subtitle}
      icon={KPI_ICONS.pricing}
    />
  );
}
