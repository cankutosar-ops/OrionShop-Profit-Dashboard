"use client";

import type { ReactNode } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import {
  shareOfNetSalesPercent,
} from "@/lib/profit-engine-model-b";
import { isNetSalesReady } from "@/lib/sales-revenue-resolution";
import { sanitizeUnavailableReason, TEMPORARILY_UNAVAILABLE } from "@/lib/user-facing-errors";
import type {
  ModelBProfitMetrics,
  OrdersPurchasesKpis,
  QuantityMetrics,
} from "@/types/database";

const MODEL_B_ICON = {
  commission: "from-orange-500/25 to-orange-500/5 text-orange-500",
  acquiring: "from-purple-500/25 to-purple-500/5 text-purple-500",
  revenue: "from-blue-500/25 to-blue-500/5 text-blue-500",
  logistics: "from-amber-500/25 to-amber-500/5 text-amber-500",
  storage: "from-zinc-500/25 to-zinc-500/5 text-zinc-400",
  penalties: "from-danger/25 to-danger/5 text-danger",
  adjustments: "from-orange-700/25 to-orange-700/5 text-orange-700",
  productCost: "from-zinc-400/20 to-zinc-400/5 text-zinc-300",
} as const;

type DashboardProfitSectionProps = {
  modelB: ModelBProfitMetrics;
  quantities: QuantityMetrics;
  kpis: OrdersPurchasesKpis;
  totalOrdersCount: number;
  isEmptyPeriod: boolean;
};

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

export function DashboardProfitSection({
  modelB,
  quantities,
  kpis,
  totalOrdersCount,
  isEmptyPeriod,
}: DashboardProfitSectionProps) {
  const emptyValue = "—";
  const revenueReady = isNetSalesReady(modelB.netSalesStatus);

  const formatMoney = (value: number) => (isEmptyPeriod ? emptyValue : formatKpiCurrency(value));
  const formatRate = (value: number) => (isEmptyPeriod ? emptyValue : formatKpiPercent(value));
  const formatMoneyOrPending = (value: number) => {
    if (isEmptyPeriod) return emptyValue;
    if (!revenueReady) return TEMPORARILY_UNAVAILABLE;
    return formatKpiCurrency(value);
  };

  const shareOfNetSales = (amount: number) => {
    if (isEmptyPeriod || !revenueReady || modelB.netSales <= 0) return emptyValue;
    return formatKpiPercent(shareOfNetSalesPercent(modelB.netSales, amount));
  };

  const operationalMetrics = (
    <div className="border-t border-border/60 pt-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Operational Metrics
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Units Sold"
          value={formatKpiCount(quantities.unitsSold)}
          icon={KPI_ICONS.purchases}
          variant="success"
        />
        <MetricCard
          title="Returned Units"
          value={formatKpiCount(quantities.unitsReturned)}
          icon={KPI_ICONS.returns}
          variant={quantities.unitsReturned > 0 ? "warning" : "default"}
        />
        <MetricCard
          title="Net Units"
          value={formatKpiCount(quantities.netUnits)}
          subtitle={`Return rate ${formatRate(kpis.returnRate)}`}
          icon={KPI_ICONS.units}
          variant="default"
        />
        <MetricCard
          title="Orders"
          value={formatKpiCount(totalOrdersCount)}
          subtitle={`${formatKpiCount(kpis.ordersCount)} non-cancelled`}
          icon={KPI_ICONS.orders}
          variant="default"
        />
      </div>
    </div>
  );

  return (
    <KpiSection
      title="Commercial Performance"
      description="Sales, costs, and final net profit after tax for the selected date range"
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <MetricCard
            title="Sales"
            value={formatMoneyOrPending(modelB.netSales)}
            subtitle={
              revenueReady
                ? `${formatKpiCount(quantities.unitsSold)} units sold`
                : sanitizeUnavailableReason(undefined, "Awaiting sales data")
            }
            icon={KPI_ICONS.purchases}
            variant="default"
          />
          <MetricCard
            title="Commission"
            value={formatMoneyOrPending(modelB.commission)}
            subtitle={`${shareOfNetSales(modelB.commission)} of sales`}
            hint="Wildberries marketplace sales commission."
            icon={KPI_ICONS.commission}
            iconClassName={MODEL_B_ICON.commission}
            variant="warning"
          />
          <MetricCard
            title="Revenue"
            value={formatMoneyOrPending(modelB.revenue)}
            subtitle={`${shareOfNetSales(modelB.revenue)} of sales`}
            hint="Commercial revenue after marketplace commission."
            icon={KPI_ICONS.revenue}
            iconClassName={MODEL_B_ICON.revenue}
            variant="default"
          />
          <MetricCard
            title="Logistics"
            value={formatMoney(modelB.logistics)}
            subtitle={`${shareOfNetSales(modelB.logistics)} of sales`}
            icon={KPI_ICONS.logistics}
            iconClassName={MODEL_B_ICON.logistics}
            variant="warning"
          />
          <MetricCard
            title="Storage"
            value={formatMoney(modelB.storage)}
            subtitle={`${shareOfNetSales(modelB.storage)} of sales`}
            icon={KPI_ICONS.storage}
            iconClassName={MODEL_B_ICON.storage}
            variant="default"
          />
          <MetricCard
            title="Penalties"
            value={formatMoney(modelB.penalties)}
            subtitle={`${shareOfNetSales(modelB.penalties)} of sales`}
            icon={KPI_ICONS.penalties}
            iconClassName={MODEL_B_ICON.penalties}
            variant="danger"
          />
          <MetricCard
            title="Adjustments"
            value={formatMoney(modelB.adjustments)}
            subtitle={`${shareOfNetSales(modelB.adjustments)} of sales`}
            hint="Monthly operational adjustments allocated to the selected reporting period."
            icon={KPI_ICONS.adjustments}
            iconClassName={MODEL_B_ICON.adjustments}
            variant="warning"
          />
          <MetricCard
            title="Product Cost"
            value={formatMoney(modelB.productCost)}
            subtitle={`${shareOfNetSales(modelB.productCost)} of sales`}
            icon={KPI_ICONS.cost}
            iconClassName={MODEL_B_ICON.productCost}
            variant="default"
          />
          <MetricCard
            title="Advertising"
            value={formatMoney(modelB.advertising)}
            subtitle={`${shareOfNetSales(modelB.advertising)} of sales`}
            icon={KPI_ICONS.advertising}
            variant="default"
          />
          <MetricCard
            title="Acquiring"
            value={formatMoney(modelB.acquiring)}
            subtitle={`${shareOfNetSales(modelB.acquiring)} of sales`}
            hint="Payment processing fee — included in Seller Payout (deducted before tax)."
            icon={KPI_ICONS.acquiring}
            iconClassName={MODEL_B_ICON.acquiring}
            variant="default"
          />
          <MetricCard
            title="Operating Profit"
            value={formatMoneyOrPending(modelB.operatingProfit)}
            subtitle={
              revenueReady
                ? `${shareOfNetSales(modelB.operatingProfit)} of sales · before tax`
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="Seller Payout − Product Cost − Advertising (before tax)."
            icon={KPI_ICONS.profit}
            variant={
              isEmptyPeriod || !revenueReady
                ? "default"
                : modelB.operatingProfit > 0
                  ? "success"
                  : modelB.operatingProfit < 0
                    ? "danger"
                    : "default"
            }
          />
          <MetricCard
            title="Estimated Tax"
            value={formatMoneyOrPending(modelB.estimatedTax)}
            subtitle={
              revenueReady
                ? `${modelB.taxPercent}% of Seller Payout`
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="Tax = Seller Payout × Tax%. Product Cost and Marketing do not affect the tax base."
            icon={KPI_ICONS.tax}
            variant="default"
          />
          <MetricCard
            title="Final Net Profit"
            value={formatMoneyOrPending(modelB.finalNetProfit)}
            subtitle={
              revenueReady
                ? `${shareOfNetSales(modelB.finalNetProfit)} of sales · after tax`
                : sanitizeUnavailableReason(undefined, "Awaiting revenue data")
            }
            hint="After Tax Payout − Product Cost − Advertising."
            icon={KPI_ICONS.profit}
            size="hero"
            className="ring-1 ring-primary/30"
            variant={
              isEmptyPeriod || !revenueReady
                ? "default"
                : modelB.finalNetProfit > 0
                  ? "success"
                  : modelB.finalNetProfit < 0
                    ? "danger"
                    : "default"
            }
            iconClassName={
              isEmptyPeriod || !revenueReady
                ? undefined
                : modelB.finalNetProfit > 0
                  ? undefined
                  : modelB.finalNetProfit < 0
                    ? undefined
                    : "from-zinc-500/25 to-zinc-500/5 text-zinc-400"
            }
          />
        </div>
        {operationalMetrics}
      </div>
    </KpiSection>
  );
}
