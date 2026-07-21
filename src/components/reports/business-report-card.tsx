import Link from "next/link";
import { Suspense } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ExportBusinessReportButton } from "@/components/reports/export-business-report-button";
import {
  formatKpiCount,
  formatKpiCurrency,
  formatKpiPercent,
  percentChange,
  type MetricTrendInput,
} from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";

type KpiSnapshot = {
  revenue: number;
  profit: number;
  orders: number;
  conversion: number;
  currency: string;
};

type KpiTrends = {
  revenue?: MetricTrendInput | null;
  profit?: MetricTrendInput | null;
  orders?: MetricTrendInput | null;
  conversion?: MetricTrendInput | null;
};

type BusinessReportCardProps = {
  previewHref: string;
  periodLabel: string;
  lastSyncLabel: string;
  lastGeneratedLabel: string;
  brandLabel?: string | null;
  kpis: KpiSnapshot | null;
  /** Honest prior-period trends — omit when comparison data is missing. */
  kpiTrends?: KpiTrends | null;
};

export function BusinessReportCard({
  previewHref,
  periodLabel,
  lastSyncLabel,
  lastGeneratedLabel,
  brandLabel,
  kpis,
  kpiTrends,
}: BusinessReportCardProps) {
  return (
    <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Featured report
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Business Report
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Management performance pack for the selected period — Cover,
            Executive Summary, Financial, Product, and Inventory sheets prepared
            automatically by WB Dashboard.
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
              title="Revenue"
              value={formatKpiCurrency(kpis.revenue, kpis.currency)}
              icon={KPI_ICONS.revenue}
              trend={kpiTrends?.revenue}
            />
            <MetricCard
              size="compact"
              title="Profit"
              value={formatKpiCurrency(kpis.profit, kpis.currency)}
              icon={KPI_ICONS.profit}
              variant={kpis.profit >= 0 ? "success" : "danger"}
              trend={kpiTrends?.profit}
            />
            <MetricCard
              size="compact"
              title="Orders"
              value={formatKpiCount(kpis.orders)}
              icon={KPI_ICONS.orders}
              trend={kpiTrends?.orders}
            />
            <MetricCard
              size="compact"
              title="Conversion"
              value={formatKpiPercent(kpis.conversion)}
              icon={KPI_ICONS.conversion}
              trend={kpiTrends?.conversion}
            />
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">
          No KPI snapshot for the selected period.
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
          <ExportBusinessReportButton />
        </Suspense>
      </div>
    </article>
  );
}

type ComingSoonCardProps = {
  name: string;
  description: string;
};

export function ComingSoonReportCard({ name, description }: ComingSoonCardProps) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Coming Soon
        </span>
      </div>
    </article>
  );
}

/** Build honest KPI trends from current vs prior overview snapshots. */
export function buildKpiTrendsFromOverview(
  current: {
    revenue: number;
    profit: number;
    orders: number;
    conversion: number;
  },
  prior: {
    revenue: number;
    profit: number;
    orders: number;
    conversion: number;
  } | null
): KpiTrends | null {
  if (!prior) return null;
  const label = "vs prior period";
  return {
    revenue: { percentChange: percentChange(current.revenue, prior.revenue), label },
    profit: { percentChange: percentChange(current.profit, prior.profit), label },
    orders: { percentChange: percentChange(current.orders, prior.orders), label },
    conversion: {
      percentChange: percentChange(current.conversion, prior.conversion),
      label,
    },
  };
}
