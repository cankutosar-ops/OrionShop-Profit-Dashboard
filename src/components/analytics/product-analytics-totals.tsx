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
  const operationalVariant = totals.operationalProfit >= 0 ? "success" : "danger";

  return (
    <SectionShell
      title="Operational P&L"
      description="Unit economics for SKU decisions — total logistics and marketing included"
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
          title="Commission"
          value={formatKpiCurrency(totals.commission)}
          icon={KPI_ICONS.commission}
        />
        <MetricCard
          size="compact"
          title="Total Logistics"
          value={formatKpiCurrency(totals.totalLogistics)}
          subtitle={`Purchase ${formatKpiCurrency(totals.purchaseLogistics)} · Excluded ${formatKpiCurrency(totals.excludedLogistics)}`}
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
          title="Operational Profit"
          value={formatKpiCurrency(totals.operationalProfit)}
          icon={KPI_ICONS.profit}
          variant={operationalVariant}
        />
        <MetricCard
          size="compact"
          title="Operational Margin %"
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
  const financialVsOperational = totals.netProfit - totals.operationalProfit;

  return (
    <SectionShell
      title="Financial Reconciliation"
      description="Dashboard engine net profit (unchanged) vs operational view"
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          size="compact"
          title="Financial Net Profit"
          value={formatKpiCurrency(totals.netProfit)}
          subtitle="Dashboard engine · purchase logistics only"
          icon={KPI_ICONS.profit}
          variant={financialVariant}
        />
        <MetricCard
          size="compact"
          title="Financial Margin %"
          value={formatKpiPercent(totals.marginPercent)}
          icon={KPI_ICONS.conversion}
        />
        <MetricCard
          size="compact"
          title="Financial − Operational"
          value={formatKpiCurrency(financialVsOperational)}
          subtitle="≈ excluded logistics (per SKU sum)"
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
