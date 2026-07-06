import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  DollarSign,
  Package,
  Percent,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
import { CategoryProfitabilityTable } from "@/components/dashboard/category-profitability-table";
import { ChartCard } from "@/components/dashboard/chart-card";
import { CostBreakdownChart } from "@/components/dashboard/cost-breakdown-chart";
import { DataBanner } from "@/components/dashboard/data-banner";
import { MetricCard } from "@/components/dashboard/metric-card";
import { OrdersPurchasesChart } from "@/components/dashboard/orders-purchases-chart";
import { ProfitabilityBreakdown } from "@/components/dashboard/profitability-breakdown";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DashboardOperationalSync } from "@/components/dashboard/dashboard-operational-sync";
import { DashboardHeaderExtras } from "@/components/dashboard/dashboard-header-extras";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { DashboardPageSearchParamsInput } from "@/lib/filter-params";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import { getDashboardData } from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<DashboardPageSearchParamsInput>;
};

function KpiSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const { overview, categories, isSampleData, isEmptyPeriod, lastSyncAt, message } =
    await getDashboardData(scope);
  const kpis = overview.ordersPurchases;
  const profitV2 = overview.profitabilityV2;
  const totalOrdersCount = kpis.ordersCount + kpis.cancelledOrdersCount;
  const emptyValue = "—";
  const formatMoney = (value: number) => (isEmptyPeriod ? emptyValue : formatCurrency(value));
  const formatRate = (value: number) => (isEmptyPeriod ? emptyValue : formatPercent(value));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live profitability metrics from Supabase"
        headerExtras={<DashboardHeaderExtras />}
      />

      <Suspense fallback={null}>
        <DashboardOperationalSync />
      </Suspense>

      <DataBanner
        isSampleData={isSampleData}
        isEmptyPeriod={isEmptyPeriod}
        lastSyncAt={lastSyncAt}
        syncAdjusted={params.syncAdjusted === "1"}
        dateManual={params.dateManual === "1"}
        message={message}
      />

      <div className="space-y-8">
        <KpiSection title="Overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              title="Revenue"
              value={formatMoney(overview.revenue)}
              icon={DollarSign}
              variant="default"
            />
            <MetricCard
              title="Net Profit"
              value={formatMoney(overview.netProfit)}
              icon={TrendingUp}
              variant={
                isEmptyPeriod ? "default" : overview.netProfit >= 0 ? "success" : "danger"
              }
            />
            <MetricCard
              title="Margin"
              value={formatRate(profitV2.marginPercent)}
              subtitle="Gross profit ÷ revenue"
              icon={Percent}
              variant={
                isEmptyPeriod ? "default" : profitV2.marginPercent >= 30 ? "success" : "default"
              }
            />
            <MetricCard
              title="Orders"
              value={formatNumber(totalOrdersCount)}
              subtitle={`${formatNumber(kpis.ordersCount)} non-cancelled`}
              icon={ShoppingCart}
              variant="default"
            />
            <MetricCard
              title="Purchases"
              value={formatNumber(kpis.purchasesCount)}
              subtitle={formatMoney(kpis.purchasesAmount)}
              icon={ShoppingBag}
              variant="success"
            />
            <MetricCard
              title="Return Rate"
              value={formatRate(kpis.returnRate)}
              subtitle={
                isEmptyPeriod ? emptyValue : `${overview.unitsReturned} returns`
              }
              icon={RotateCcw}
              variant={isEmptyPeriod ? "default" : kpis.returnRate > 10 ? "danger" : "default"}
            />
          </div>
        </KpiSection>

        <KpiSection title="Financial Summary" description="Cost breakdown for the selected period">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Product Cost"
              value={formatMoney(profitV2.productCost)}
              icon={Package}
              variant="warning"
            />
            <MetricCard
              title="Marketplace Fees"
              value={formatMoney(profitV2.marketplaceFees)}
              subtitle="Commission + deductions"
              icon={Receipt}
              variant="warning"
            />
            <MetricCard
              title="Logistics"
              value={formatMoney(overview.logistics)}
              icon={Truck}
              variant="default"
            />
            <MetricCard
              title="Storage"
              value={formatMoney(overview.storage)}
              icon={Warehouse}
              variant="default"
            />
          </div>
        </KpiSection>
      </div>

      <div className="mt-8">
        <ChartCard
          title="Orders vs Purchases"
          description="Daily quantity (bars) and amount (lines) over selected period"
        >
          <OrdersPurchasesChart data={kpis.dailyOrdersPurchases} />
        </ChartCard>
      </div>

      <div className="mt-8">
        <ProfitabilityBreakdown metrics={profitV2} revenue={overview.revenue} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <ChartCard
          title="Revenue & Profit Trend"
          description="Daily performance over selected period"
          className="lg:col-span-2"
        >
          <RevenueChart data={overview.dailyRevenue} />
          <div className="mt-4 flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="text-muted-foreground">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <span className="text-muted-foreground">Net Profit</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Cost Breakdown" description="Where your revenue goes">
          <CostBreakdownChart data={overview.costBreakdown} />
        </ChartCard>
      </div>

      <div className="mt-8">
        <CategoryProfitabilityTable categories={categories} isSampleData={isSampleData} />
      </div>
    </>
  );
}
