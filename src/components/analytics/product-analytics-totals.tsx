import type { ReactNode } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import type { ProductAnalyticsTotals } from "@/types/database";

type ProductAnalyticsTotalsSectionProps = {
  totals: ProductAnalyticsTotals;
};

function SectionShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function ProductAnalyticsFunnelSection({ totals }: { totals: ProductAnalyticsTotals }) {
  return (
    <SectionShell
      title="Funnel"
      description="Order flow — volume and conversion, separate from unit economics"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          size="compact"
          title="Orders"
          value={formatKpiCount(totals.orders)}
          icon={KPI_ICONS.orders}
        />
        <MetricCard
          size="compact"
          title="Buyout"
          value={formatKpiCount(totals.purchases)}
          icon={KPI_ICONS.purchases}
        />
        <MetricCard
          size="compact"
          title="Conversion %"
          value={formatKpiPercent(totals.conversionPercent)}
          icon={KPI_ICONS.conversion}
        />
        <MetricCard
          size="compact"
          title="Lost Orders"
          value={formatKpiCount(totals.lostOrders)}
          subtitle="Orders − Buyout"
          icon={KPI_ICONS.orders}
        />
      </div>
    </SectionShell>
  );
}

function ProductAnalyticsOperationalSection({ totals }: { totals: ProductAnalyticsTotals }) {
  const netVariant = totals.operationalProfit >= 0 ? "success" : "danger";

  return (
    <SectionShell
      title="Product P&L (attributed)"
      description="V4 Net Profit per SKU — Marketplace Fees informational only; unmatched logistics stay Unallocated"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
        <MetricCard
          size="compact"
          title="Revenue"
          value={formatKpiCurrency(totals.revenue)}
          icon={KPI_ICONS.revenue}
        />
        <MetricCard
          size="compact"
          title="Product Cost"
          value={formatKpiCurrency(totals.productCost)}
          icon={KPI_ICONS.cost}
        />
        <MetricCard
          size="compact"
          title="Marketplace Fees"
          value={formatKpiCurrency(totals.marketplaceFees)}
          subtitle="Informational · not deducted again"
          icon={KPI_ICONS.commission}
        />
        <MetricCard
          size="compact"
          title="Attributed Logistics"
          value={formatKpiCurrency(totals.totalLogistics)}
          subtitle={`Unallocated ${formatKpiCurrency(totals.unallocatedLogistics)}`}
          icon={KPI_ICONS.logistics}
        />
        <MetricCard
          size="compact"
          title="Return Logistics"
          value={formatKpiCurrency(totals.returnLogistics)}
          icon={KPI_ICONS.returns}
        />
        <MetricCard
          size="compact"
          title="Marketing"
          value={formatKpiCurrency(totals.marketing)}
          icon={KPI_ICONS.advertising}
        />
        <MetricCard
          size="compact"
          title="Other Marketplace"
          value={formatKpiCurrency(totals.otherMarketplaceCosts)}
          icon={KPI_ICONS.settlement}
        />
        <MetricCard
          size="compact"
          title="Net Profit"
          value={formatKpiCurrency(totals.operationalProfit)}
          icon={KPI_ICONS.profit}
          variant={netVariant}
        />
        <MetricCard
          size="compact"
          title="Net Margin %"
          value={formatKpiPercent(totals.operationalMarginPercent)}
          icon={KPI_ICONS.conversion}
        />
      </div>
    </SectionShell>
  );
}

function ProductAnalyticsFinancialSection({ totals }: { totals: ProductAnalyticsTotals }) {
  const financialVariant = totals.netProfit >= 0 ? "success" : "danger";
  const purchaseRows = totals.purchaseLogisticsRows ?? 0;
  const excludedRows = totals.excludedLogisticsRows ?? 0;
  const logisticsCheck =
    Math.abs(
      totals.totalLogistics + totals.unallocatedLogistics - totals.accountLogisticsTotal
    ) < 0.02;

  return (
    <SectionShell
      title="Attribution reconciliation"
      description="Attributed + Unallocated logistics must equal account logistics · Dashboard V4 account P&L is unchanged"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          size="compact"
          title="Σ Product Net Profit"
          value={formatKpiCurrency(totals.netProfit)}
          subtitle="Attributed SKUs only · not full account P&L"
          icon={KPI_ICONS.profit}
          variant={financialVariant}
        />
        <MetricCard
          size="compact"
          title="Account Logistics"
          value={formatKpiCurrency(totals.accountLogisticsTotal)}
          subtitle={
            logisticsCheck
              ? "Attributed + Unallocated reconcile"
              : "Check attribution math"
          }
          icon={KPI_ICONS.logistics}
        />
        <MetricCard
          size="compact"
          title="Unallocated Logistics"
          value={formatKpiCurrency(totals.unallocatedLogistics)}
          subtitle="Not in product Net Profit"
          icon={KPI_ICONS.cost}
          variant="muted"
        />
        <MetricCard
          size="compact"
          title="Purchase Logistics (detail)"
          value={formatKpiCurrency(totals.purchaseLogistics)}
          subtitle={`${purchaseRows.toLocaleString("ru-RU")} rows · ${excludedRows.toLocaleString("ru-RU")} excluded`}
          icon={KPI_ICONS.logistics}
          variant="muted"
        />
      </div>
    </SectionShell>
  );
}

export function ProductAnalyticsTotalsSection({ totals }: ProductAnalyticsTotalsSectionProps) {
  return (
    <div className="space-y-4">
      <ProductAnalyticsFunnelSection totals={totals} />
      <ProductAnalyticsOperationalSection totals={totals} />
      <ProductAnalyticsFinancialSection totals={totals} />
    </div>
  );
}
