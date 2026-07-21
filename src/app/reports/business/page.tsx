import Link from "next/link";
import { Suspense } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ExportBusinessReportButton } from "@/components/reports/export-business-report-button";
import { ReportsHeader } from "@/components/reports/reports-header";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { provideBusinessReportSections } from "@/lib/reports/report-providers";
import { getCompanyById } from "@/services/marketplace-account-service";
import type {
  BusinessExecutiveSummaryData,
  BusinessInventorySummaryData,
  BusinessProductSummaryData,
} from "@/lib/reports/report-engine-types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function BusinessReportPreviewPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const backHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";
  const scope = await resolveScopedDateRange(params);
  const company = await getCompanyById(scope.companyId);
  const currency = company?.currency?.trim() || "RUB";

  const sections = await provideBusinessReportSections(scope);
  const executive = sections.find((s) => s.id === "executive-summary")
    ?.data as BusinessExecutiveSummaryData | undefined;
  const product = sections.find((s) => s.id === "product-summary")
    ?.data as BusinessProductSummaryData | undefined;
  const inventory = sections.find((s) => s.id === "inventory-summary")
    ?.data as BusinessInventorySummaryData | undefined;

  return (
    <>
      <ReportsHeader
        title="Business Report"
        description="Preview of the management workbook for the selected period"
      />

      <div className="mb-4">
        <Link
          href={backHref}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to Reports
        </Link>
      </div>

      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Orion Shop · Business Performance Report
          </p>
          <h2 className="mt-1 text-lg font-semibold">Executive Summary</h2>
          {executive ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  size="compact"
                  title="Revenue"
                  value={formatKpiCurrency(executive.revenue, currency)}
                  icon={KPI_ICONS.revenue}
                />
                <MetricCard
                  size="compact"
                  title="Profit"
                  value={formatKpiCurrency(executive.netProfit, currency)}
                  icon={KPI_ICONS.profit}
                  variant={executive.netProfit >= 0 ? "success" : "danger"}
                />
                <MetricCard
                  size="compact"
                  title="Orders"
                  value={formatKpiCount(executive.orders)}
                  icon={KPI_ICONS.orders}
                />
                <MetricCard
                  size="compact"
                  title="Conversion"
                  value={formatKpiPercent(executive.conversionRate)}
                  icon={KPI_ICONS.conversion}
                />
              </div>
              {executive.insights.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-sm font-medium">Executive Insights</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {executive.insights.map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No executive metrics for this period.
            </p>
          )}
        </section>

        {product?.highlights?.length ? (
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Product Highlights</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {product.highlights.map((h) => (
                <li
                  key={`${h.label}-${h.sku}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2 last:border-0"
                >
                  <span>
                    <span className="text-muted-foreground">{h.label}: </span>
                    <span className="font-medium">{h.sku}</span>
                    <span className="text-muted-foreground"> — {h.productName}</span>
                  </span>
                  <span className="font-medium tabular-nums">{h.valueLabel}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {inventory ? (
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Inventory Health</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                size="compact"
                title="Healthy"
                value={formatKpiCount(inventory.health.healthy)}
                icon={KPI_ICONS.inventory}
                variant="success"
              />
              <MetricCard
                size="compact"
                title="Low Stock"
                value={formatKpiCount(inventory.health.lowStock)}
                icon={KPI_ICONS.inventory}
                variant="warning"
              />
              <MetricCard
                size="compact"
                title="Out of Stock"
                value={formatKpiCount(inventory.health.outOfStock)}
                icon={KPI_ICONS.inventory}
                variant="danger"
              />
              <MetricCard
                size="compact"
                title="Warehouse Coverage"
                value={formatKpiCount(inventory.health.warehouseCoverage)}
                icon={KPI_ICONS.storage}
              />
            </div>
          </section>
        ) : null}

        <Suspense fallback={null}>
          <ExportBusinessReportButton label="Export Excel" />
        </Suspense>
      </div>
    </>
  );
}
