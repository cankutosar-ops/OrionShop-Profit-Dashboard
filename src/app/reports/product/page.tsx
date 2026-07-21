import Link from "next/link";
import { Suspense } from "react";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ExportProductReportButton } from "@/components/reports/export-business-report-button";
import { ProductReportMarketplaceCostPanel } from "@/components/reports/product-report-marketplace-cost-panel";
import { ReportsHeader } from "@/components/reports/reports-header";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { KPI_ICONS } from "@/lib/kpi-icons";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { buildPortfolioConcentration } from "@/lib/reports/product-report-concentration";
import { provideProductReportSections } from "@/lib/reports/product-report-providers";
import type {
  ProductReportExecutiveData,
  ProductReportMarketplaceCostData,
  ProductReportPerformanceData,
  ProductReportPortfolioData,
  ProductReportProfitabilityData,
} from "@/lib/reports/report-engine-types";
import { getCompanyById } from "@/services/marketplace-account-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ProductReportPreviewPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const backHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";
  const scope = await resolveScopedDateRange(params);
  const company = await getCompanyById(scope.companyId);
  const currency = company?.currency?.trim() || "RUB";

  const sections = await provideProductReportSections(scope);
  const executive = sections.find((s) => s.id === "product-executive-summary")
    ?.data as ProductReportExecutiveData | undefined;
  const performance = sections.find((s) => s.id === "product-performance")
    ?.data as ProductReportPerformanceData | undefined;
  const profitability = sections.find((s) => s.id === "product-profitability")
    ?.data as ProductReportProfitabilityData | undefined;
  const portfolio = sections.find((s) => s.id === "product-portfolio")
    ?.data as ProductReportPortfolioData | undefined;
  const marketplaceCost = sections.find((s) => s.id === "product-marketplace-cost")
    ?.data as ProductReportMarketplaceCostData | undefined;

  const concentration = buildPortfolioConcentration(performance?.rows ?? []);

  return (
    <>
      <ReportsHeader
        title="Product Report"
        description="Preview of the product management workbook for the selected period"
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
            Orion Shop · Product Performance Report
          </p>
          <h2 className="mt-1 text-lg font-semibold">Executive Summary</h2>
          {executive ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MetricCard
                  size="compact"
                  title="Total Products"
                  value={formatKpiCount(executive.totalProducts)}
                  icon={KPI_ICONS.units}
                />
                <MetricCard
                  size="compact"
                  title="With Sales"
                  value={formatKpiCount(executive.productsWithSales)}
                  icon={KPI_ICONS.purchases}
                />
                <MetricCard
                  size="compact"
                  title="Avg Margin"
                  value={
                    executive.averageMarginPercent == null
                      ? "—"
                      : formatKpiPercent(executive.averageMarginPercent)
                  }
                  icon={KPI_ICONS.conversion}
                />
                <MetricCard
                  size="compact"
                  title="Inventory Units"
                  value={
                    executive.inventoryUnits == null
                      ? "—"
                      : formatKpiCount(executive.inventoryUnits)
                  }
                  icon={KPI_ICONS.inventory}
                />
              </div>

              {concentration ? (
                <div className="mt-6">
                  <h3 className="text-sm font-medium">Portfolio Concentration</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Shares from Product Performance rows already in this report
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MetricCard
                      size="compact"
                      title="Top 5 Revenue"
                      value={formatKpiPercent(concentration.top5RevenueSharePercent)}
                      icon={KPI_ICONS.revenue}
                    />
                    <MetricCard
                      size="compact"
                      title="Top 5 Profit"
                      value={formatKpiPercent(concentration.top5ProfitSharePercent)}
                      icon={KPI_ICONS.profit}
                    />
                    <MetricCard
                      size="compact"
                      title="Top Product Revenue"
                      value={formatKpiPercent(
                        concentration.topProductRevenueSharePercent
                      )}
                      icon={KPI_ICONS.revenue}
                    />
                    <MetricCard
                      size="compact"
                      title="Top Product Profit"
                      value={formatKpiPercent(
                        concentration.topProductProfitSharePercent
                      )}
                      icon={KPI_ICONS.profit}
                    />
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <li>
                      Top 5 products generate{" "}
                      {formatKpiPercent(concentration.top5RevenueSharePercent)} of
                      total revenue.
                    </li>
                    <li>
                      Top 5 products generate{" "}
                      {formatKpiPercent(concentration.top5ProfitSharePercent)} of
                      total profit.
                    </li>
                    <li>
                      Top revenue product contributes{" "}
                      {formatKpiPercent(concentration.topProductRevenueSharePercent)}{" "}
                      of portfolio revenue.
                    </li>
                    <li>
                      Top profit product contributes{" "}
                      {formatKpiPercent(concentration.topProductProfitSharePercent)} of
                      portfolio profit.
                    </li>
                  </ul>
                </div>
              ) : null}

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

        {executive?.topRevenueProduct || executive?.topProfitProduct ? (
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Product Highlights</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {executive.topRevenueProduct ? (
                <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2">
                  <span>
                    <span className="text-muted-foreground">Top Revenue: </span>
                    <span className="font-medium">
                      {executive.topRevenueProduct.sku}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatKpiCurrency(executive.topRevenueProduct.value, currency)}
                  </span>
                </li>
              ) : null}
              {executive.topProfitProduct ? (
                <li className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 py-2">
                  <span>
                    <span className="text-muted-foreground">Top Profit: </span>
                    <span className="font-medium">
                      {executive.topProfitProduct.sku}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatKpiCurrency(executive.topProfitProduct.value, currency)}
                  </span>
                </li>
              ) : null}
              {executive.lowestPerformingProduct ? (
                <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="text-muted-foreground">Lowest Performing: </span>
                    <span className="font-medium">
                      {executive.lowestPerformingProduct.sku}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatKpiCurrency(
                      executive.lowestPerformingProduct.value,
                      currency
                    )}
                  </span>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        {marketplaceCost ? (
          <ProductReportMarketplaceCostPanel
            data={marketplaceCost}
            currency={currency}
          />
        ) : null}

        {profitability ? (
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Profitability Snapshot</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard
                size="compact"
                title="Top Profit SKUs"
                value={formatKpiCount(profitability.topProfit.length)}
                icon={KPI_ICONS.profit}
                variant="success"
              />
              <MetricCard
                size="compact"
                title="Negative Profit"
                value={formatKpiCount(profitability.negativeProfit.length)}
                icon={KPI_ICONS.profit}
                variant="danger"
              />
              <MetricCard
                size="compact"
                title="Products in Table"
                value={formatKpiCount(performance?.rows.length ?? 0)}
                icon={KPI_ICONS.units}
              />
            </div>
          </section>
        ) : null}

        {portfolio?.largestBrand || portfolio?.highestProfitCategory ? (
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-lg font-semibold">Portfolio</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {portfolio.largestBrand ? (
                <li>
                  Largest brand:{" "}
                  <span className="font-medium text-foreground">
                    {portfolio.largestBrand.name}
                  </span>
                </li>
              ) : null}
              {portfolio.highestProfitCategory ? (
                <li>
                  Highest profit category:{" "}
                  <span className="font-medium text-foreground">
                    {portfolio.highestProfitCategory.name}
                  </span>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null}

        <Suspense fallback={null}>
          <ExportProductReportButton label="Export Excel" />
        </Suspense>
      </div>
    </>
  );
}
