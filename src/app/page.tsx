import { ChartCard } from "@/components/dashboard/chart-card";
import {
  CostBreakdownChartLazy,
  OrdersPurchasesChartLazy,
  RevenueChartLazy,
} from "@/components/dashboard/dashboard-charts-lazy";
import { DashboardProfitSection } from "@/components/dashboard/dashboard-profit-section";
import {
  DashboardWbSection,
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
import { ReadBudgetExceeded, withReadBudget } from "@/lib/supabase/read-budget";
import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";
import { AuthServiceUnavailable } from "@/lib/security/auth-unavailable";
import { headers } from "next/headers";

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

export default async function DashboardPage({ searchParams }: PageProps) {
  const requestId = (await headers()).get("x-orion-request-id") ?? undefined;
  const started = Date.now();
  try {
    // Includes authorization, SQL, tax inputs and optional KPIs in one budget.
    // Leave time for rendering before the host terminates the response.
    const page = await withReadBudget(() => loadDashboardPage({ searchParams }), 40_000, requestId);
    console.info("[dashboard-load]", { requestId, status: "ready", durationMs: Date.now() - started });
    return page;
  } catch (error) {
    // Authorization redirects are successful control flow, not load failures.
    if (error && typeof error === "object" && "digest" in error &&
      typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT;")) throw error;
    console.error("[dashboard-load]", { requestId, status: "failed", durationMs: Date.now() - started, kind: error instanceof Error ? error.name : "unknown" });
    if (!(error instanceof ReadBudgetExceeded) && !(error instanceof AuthServiceUnavailable)) throw error;
    return <DashboardLoadError />;
  }
}

async function loadDashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await measureAsync("server.resolveScopedDateRange", "server", () =>
    resolveScopedDateRange(params)
  );
  // Resolve the complete server payload before returning markup. This avoids
  // leaving an RSC stream open while the database is still responding.
  const content = await DashboardCoreSection({
    scope,
    syncAdjusted: params.syncAdjusted,
    dateManual: params.dateManual,
  });

  return (
    <>
      <PageHeader variant="toolbar" headerExtras={<DashboardHeaderExtras />} />

      {content}
    </>
  );
}
