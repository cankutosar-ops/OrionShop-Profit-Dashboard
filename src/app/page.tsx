import type { ReactNode } from "react";
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
import { PageHeader } from "@/components/layout/page-header";
import { formatCurrency, formatNumber, formatPercent, parseDateRange } from "@/lib/utils";
import { getDashboardData } from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
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
  const range = parseDateRange(params.from, params.to);
  const { overview, categories, isSampleData, message } = await getDashboardData(range);
  const kpis = overview.ordersPurchases;
  const profitV2 = overview.profitabilityV2;
  const totalOrdersCount = kpis.ordersCount + kpis.cancelledOrdersCount;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live profitability metrics from Supabase"
      />

      <DataBanner isSampleData={isSampleData} message={message} />

      <div className="space-y-8">
        <KpiSection title="Overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard
              title="Revenue"
              value={formatCurrency(overview.revenue)}
              icon={DollarSign}
              variant="default"
            />
            <MetricCard
              title="Net Profit"
              value={formatCurrency(overview.netProfit)}
              icon={TrendingUp}
              variant={overview.netProfit >= 0 ? "success" : "danger"}
            />
            <MetricCard
              title="Margin"
              value={formatPercent(profitV2.marginPercent)}
              subtitle="Gross profit ÷ revenue"
              icon={Percent}
              variant={profitV2.marginPercent >= 30 ? "success" : "default"}
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
              subtitle={formatCurrency(kpis.purchasesAmount)}
              icon={ShoppingBag}
              variant="success"
            />
            <MetricCard
              title="Return Rate"
              value={formatPercent(kpis.returnRate)}
              subtitle={`${overview.unitsReturned} returns`}
              icon={RotateCcw}
              variant={kpis.returnRate > 10 ? "danger" : "default"}
            />
          </div>
        </KpiSection>

        <KpiSection title="Financial Summary" description="Cost breakdown for the selected period">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Product Cost"
              value={formatCurrency(profitV2.productCost)}
              icon={Package}
              variant="warning"
            />
            <MetricCard
              title="Marketplace Fees"
              value={formatCurrency(profitV2.marketplaceFees)}
              subtitle="Commission + deductions"
              icon={Receipt}
              variant="warning"
            />
            <MetricCard
              title="Logistics"
              value={formatCurrency(overview.logistics)}
              icon={Truck}
              variant="default"
            />
            <MetricCard
              title="Storage"
              value={formatCurrency(overview.storage)}
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
