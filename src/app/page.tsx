import { Suspense } from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import {
  CostBreakdownChartLazy,
  OrdersPurchasesChartLazy,
  RevenueChartLazy,
} from "@/components/dashboard/dashboard-charts-lazy";
import { DashboardProfitSection } from "@/components/dashboard/dashboard-profit-section";
import {
  DashboardWbDeferredSection,
  DashboardWbSectionFallback,
} from "@/components/dashboard/dashboard-wb-deferred-section";
import { DataBanner } from "@/components/dashboard/data-banner";
import { ProfitabilityBreakdown } from "@/components/dashboard/profitability-breakdown";
import { ProfitabilityGroupedTable } from "@/components/dashboard/profitability-grouped-table";
import { DashboardOperationalSync } from "@/components/dashboard/dashboard-operational-sync";
import { DashboardHeaderExtras } from "@/components/dashboard/dashboard-header-extras";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { DashboardPageSearchParamsInput } from "@/lib/filter-params";
import { measureAsync, recordPerfEvent } from "@/lib/perf/perf-recorder";
import { getDashboardCoreData } from "@/services/dashboard-service";
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
  const { overview, categories, brands, isSampleData, isEmptyPeriod, lastSyncAt, message } =
    await getDashboardCoreData(scope);
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
          quantities={quantities}
          kpis={kpis}
          totalOrdersCount={totalOrdersCount}
          isEmptyPeriod={Boolean(isEmptyPeriod)}
        />

        <Suspense fallback={<DashboardWbSectionFallback />}>
          <DashboardWbDeferredSection
            scope={scope}
            isEmptyPeriod={Boolean(isEmptyPeriod)}
            totalOrdersCount={totalOrdersCount}
            ordersCount={kpis.ordersCount}
            ordersValueCount={kpis.ordersValueCount}
          />
        </Suspense>
      </div>

      <div className="mt-8">
        <ChartCard
          title="Orders vs Purchases"
          description="Daily quantity (bars) and amount (lines) over selected period"
        >
          <OrdersPurchasesChartLazy data={kpis.dailyOrdersPurchases} />
        </ChartCard>
      </div>

      <div className="mt-8">
        <ProfitabilityBreakdown
          modelB={overview.modelBProfit}
          isEmptyPeriod={Boolean(isEmptyPeriod)}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Revenue & Profit Trend"
          description="Daily performance over selected period"
          className="lg:col-span-2"
        >
          <RevenueChartLazy data={overview.dailyRevenue} />
          <div className="mt-4 flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <span className="text-muted-foreground">Gross Profit (daily)</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Cost Breakdown" description="Where your revenue goes">
          <CostBreakdownChartLazy data={overview.costBreakdown} />
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

  // Prefetch independent WB + SQL work so it overlaps critical-path SQL.
  void prefetchDashboardBackground(scope);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Sales, profitability, and settlement for the selected period"
        headerExtras={<DashboardHeaderExtras />}
      />

      <Suspense fallback={null}>
        <DashboardOperationalSync />
      </Suspense>

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

/** Start cached SQL/WB work immediately so Suspense children share warm results. */
async function prefetchDashboardBackground(scope: ScopedDateRange) {
  const [
    { getCachedDashboardSql },
    { loadWbWeeklySalesReports },
    { getWbBalanceMetrics },
    { fetchWbOrdersApi },
  ] = await Promise.all([
    import("@/services/dashboard-service"),
    import("@/services/wb-sales-reports-service"),
    import("@/services/wb-balance-service"),
    import("@/services/orders-value-service"),
  ]);
  void getCachedDashboardSql(
    scope.marketplaceAccountId,
    scope.companyId,
    scope.from,
    scope.to,
    scope.brandId ?? ""
  );
  void loadWbWeeklySalesReports(scope);
  void getWbBalanceMetrics(scope.marketplaceAccountId);
  void fetchWbOrdersApi(scope);
}
