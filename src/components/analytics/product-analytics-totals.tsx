import type { ReactNode } from "react";
import type { ProductAnalyticsTotals } from "@/types/database";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type ProductAnalyticsTotalsSectionProps = {
  totals: ProductAnalyticsTotals;
};

function MetricCard({
  label,
  value,
  subtitle,
  variant = "default",
}: {
  label: string;
  value: string;
  subtitle?: string;
  variant?: "default" | "success" | "danger" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border bg-card-hover px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums tracking-tight",
          variant === "success" && "text-success",
          variant === "danger" && "text-danger",
          variant === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </p>
      {subtitle && <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

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
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Orders" value={formatNumber(totals.orders)} />
        <MetricCard label="Purchases" value={formatNumber(totals.purchases)} />
        <MetricCard label="Conversion %" value={formatPercent(totals.conversionPercent)} />
        <MetricCard label="Cancelled Orders" value={formatNumber(totals.cancelled)} />
        <MetricCard label="Cancellation %" value={formatPercent(totals.cancellationPercent)} />
        <MetricCard
          label="Lost Orders"
          value={formatNumber(totals.lostOrders)}
          subtitle="Orders − purchases"
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
        <MetricCard label="Revenue" value={formatCurrency(totals.revenue)} />
        <MetricCard label="Product Cost" value={formatCurrency(totals.productCost)} />
        <MetricCard label="Commission" value={formatCurrency(totals.commission)} />
        <MetricCard
          label="Total Logistics"
          value={formatCurrency(totals.totalLogistics)}
          subtitle={`Purchase ${formatCurrency(totals.purchaseLogistics)} · Excluded ${formatCurrency(totals.excludedLogistics)}`}
        />
        <MetricCard label="Return Logistics" value={formatCurrency(totals.returnLogistics)} />
        <MetricCard label="Marketing" value={formatCurrency(totals.marketing)} />
        <MetricCard
          label="Other Marketplace"
          value={formatCurrency(totals.otherMarketplaceCosts)}
        />
        <MetricCard
          label="Operational Profit"
          value={formatCurrency(totals.operationalProfit)}
          variant={operationalVariant}
        />
        <MetricCard
          label="Operational Margin %"
          value={formatPercent(totals.operationalMarginPercent)}
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
          label="Financial Net Profit"
          value={formatCurrency(totals.netProfit)}
          subtitle="Dashboard engine · purchase logistics only"
          variant={financialVariant}
        />
        <MetricCard label="Financial Margin %" value={formatPercent(totals.marginPercent)} />
        <MetricCard
          label="Financial − Operational"
          value={formatCurrency(financialVsOperational)}
          subtitle="≈ excluded logistics (per SKU sum)"
          variant="muted"
        />
        <MetricCard
          label="Purchase Logistics (detail)"
          value={formatCurrency(totals.purchaseLogistics)}
          subtitle={`${purchaseRows.toLocaleString("ru-RU")} rows · ${excludedRows.toLocaleString("ru-RU")} excluded`}
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
