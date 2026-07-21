import Link from "next/link";
import { Suspense } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ExportProductReportButton } from "@/components/reports/export-business-report-button";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";

type ProductReportCardProps = {
  previewHref: string;
  periodLabel: string;
  lastSyncLabel: string;
  lastGeneratedLabel: string;
  brandLabel?: string | null;
  kpis: {
    products: number;
    productsWithSales: number;
    revenue: number;
    averageMargin: number | null;
    currency: string;
  } | null;
};

export function ProductReportCard({
  previewHref,
  periodLabel,
  lastSyncLabel,
  lastGeneratedLabel,
  brandLabel,
  kpis,
}: ProductReportCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Management report
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Product Report</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Product-level management pack — which products create value and which
            require action. Cover, Executive Summary, Performance, Profitability,
            Marketplace Cost, Inventory, Portfolio, and Appendix.
          </p>
        </div>
        <span className="rounded-full border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-success">
          Available
        </span>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Reporting Period</dt>
          <dd className="mt-0.5 font-medium">{periodLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last Synchronization</dt>
          <dd className="mt-0.5 font-medium">{lastSyncLabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Last Generated</dt>
          <dd className="mt-0.5 font-medium">{lastGeneratedLabel}</dd>
        </div>
        {brandLabel ? (
          <div>
            <dt className="text-muted-foreground">Brand filter</dt>
            <dd className="mt-0.5 font-medium">{brandLabel}</dd>
          </div>
        ) : null}
      </dl>

      {kpis ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Period snapshot
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetricCard
              size="compact"
              title="Products"
              value={formatKpiCount(kpis.products)}
              icon={KPI_ICONS.units}
            />
            <MetricCard
              size="compact"
              title="With Sales"
              value={formatKpiCount(kpis.productsWithSales)}
              icon={KPI_ICONS.purchases}
            />
            <MetricCard
              size="compact"
              title="Revenue"
              value={formatKpiCurrency(kpis.revenue, kpis.currency)}
              icon={KPI_ICONS.revenue}
            />
            <MetricCard
              size="compact"
              title="Avg Margin"
              value={
                kpis.averageMargin == null
                  ? "—"
                  : formatKpiPercent(kpis.averageMargin)
              }
              icon={KPI_ICONS.conversion}
            />
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          No product KPI snapshot for the selected period.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={previewHref}
          className="inline-flex items-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-card-hover"
        >
          Preview
        </Link>
        <Suspense
          fallback={
            <span className="text-sm text-muted-foreground">Loading export…</span>
          }
        >
          <ExportProductReportButton />
        </Suspense>
      </div>
    </article>
  );
}
