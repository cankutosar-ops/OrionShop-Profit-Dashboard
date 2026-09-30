import { Suspense } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  CostBreakdownChartLazy,
  OrdersPurchasesChartLazy,
  RevenueChartLazy,
} from "@/components/dashboard/dashboard-charts-lazy";
import { DashboardProfitSection } from "@/components/dashboard/dashboard-profit-section";
import {
  DashboardWbSection,
  DashboardWbSectionFallback,
} from "@/components/dashboard/dashboard-wb-deferred-section";
import { DataBanner } from "@/components/dashboard/data-banner";
import { ProfitabilityBreakdown } from "@/components/dashboard/profitability-breakdown";
import { ProfitabilityGroupedTable } from "@/components/dashboard/profitability-grouped-table";
import { DashboardHeaderExtras } from "@/components/dashboard/dashboard-header-extras";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { DashboardPageSearchParamsInput } from "@/lib/filter-params";
import { measureAsync, recordPerfEvent } from "@/lib/perf/perf-recorder";
import { getDashboardCoreData, loadDashboardWbStrip } from "@/services/dashboard-service";
import type { ScopedDateRange } from "@/types/database";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<DashboardPageSearchParamsInput>;
};

async function DashboardCoreSection({
  scope,
  syncAdjusted,
  dateManual,
}: {
  scope: ScopedDateRange;
  syncAdjusted?: string;
  dateManual?: string;
}) {
  const started = Date.now();
  const [dashboard, wbStrip] = await Promise.all([
    getDashboardCoreData(scope),
    loadDashboardWbStrip(scope),
  ]);
  const { overview, categories, brands, isSampleData, isEmptyPeriod, lastSyncAt, message } = dashboard;
  recordPerfEvent({
    category: "server",
    name: "server.DashboardPage.critical",
    durationMs: Date.now() - started,
    route: "/",
    meta: {
      account: scope.marketplaceAccountId,
      from: scope.from,
      to: scope.to,
    },
  });

  const kpis = overview.ordersPurchases;
  const quantities = overview.quantityMetrics;
  const totalOrdersCount = kpis.ordersCount + kpis.cancelledOrdersCount;

  return (
    <>
      <DataBanner
        isSampleData={isSampleData}
        isEmptyPeriod={isEmptyPeriod}
        lastSyncAt={lastSyncAt}
        syncAdjusted={syncAdjusted === "1"}
        dateManual={dateManual === "1"}
        message={message}
      />

      <div className="space-y-8">
        <DashboardProfitSection
          modelB={overview.modelBProfit}
          marketplaceFees={overview.marketplaceFeesPresentation}
          quantities={quantities}
          kpis={kpis}
          totalOrdersCount={totalOrdersCount}
          isEmptyPeriod={Boolean(isEmptyPeriod)}
        />

        <DashboardWbSection
          strip={wbStrip}
          isEmptyPeriod={Boolean(isEmptyPeriod)}
          totalOrdersCount={totalOrdersCount}
          ordersCount={kpis.ordersCount}
          ordersValueCount={kpis.ordersValueCount}
          estimatedTax={overview.modelBProfit.estimatedTax}
          taxPercent={overview.modelBProfit.taxPercent}
        />
      </div>

      <div className="mt-8">
        <ProfitabilityBreakdown
          modelB={overview.modelBProfit}
          marketplaceFees={overview.marketplaceFeesPresentation}
          isEmptyPeriod={Boolean(isEmptyPeriod)}
        />
      </div>

      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-3">
        <ChartCard
          title="Sales & Profit Trend"
          description="Daily merchandise sales (Gross Sales base) over selected period"
          className="min-w-0 xl:col-span-2"
        >
          <RevenueChartLazy data={overview.dailyRevenue} />
        </ChartCard>

        <ChartCard className="min-w-0" title="Cost Breakdown" description="Where your commercial costs go">
          <CostBreakdownChartLazy data={overview.costBreakdown} />
        </ChartCard>
      </div>

      <div className="mt-8 min-w-0">
        <ChartCard
          title="Orders vs Buyout"
          description="Order and completed-buyout quantities (bars); monetary values (lines)"
        >
          <OrdersPurchasesChartLazy data={kpis.dailyOrdersPurchases} />
        </ChartCard>
      </div>

      <div className="mt-8">
        <ProfitabilityGroupedTable
          categories={categories}
          brands={brands}
          isSampleData={isSampleData}
        />
      </div>
    </>
  );
}

function DashboardCoreFallback() {
  return (
    <div className="space-y-8">
      <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-28 animate-pulse rounded-xl bg-muted/40" />
      </div>
      <DashboardWbSectionFallback />
    </div>
  );
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await measureAsync("server.resolveScopedDateRange", "server", () =>
    resolveScopedDateRange(params)
  );

  return (
    <>
      <PageHeader variant="toolbar" headerExtras={<DashboardHeaderExtras />} />

      <Suspense
        key={`${scope.marketplaceAccountId}:${scope.from}:${scope.to}:${scope.brandId ?? ""}:${scope.companyId}`}
        fallback={<DashboardCoreFallback />}
      >
        <DashboardCoreSection
          scope={scope}
          syncAdjusted={params.syncAdjusted}
          dateManual={params.dateManual}
        />
      </Suspense>
    </>
  );
}
