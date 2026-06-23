import {
  DollarSign,
  Megaphone,
  Percent,
  RotateCcw,
  TrendingUp,
  Truck,
  Warehouse,
} from "lucide-react";
import { CategoryProfitabilityTable } from "@/components/dashboard/category-profitability-table";
import { ChartCard } from "@/components/dashboard/chart-card";
import { CostBreakdownChart } from "@/components/dashboard/cost-breakdown-chart";
import { DataBanner } from "@/components/dashboard/data-banner";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ProductProfitabilityTable } from "@/components/dashboard/product-profitability-table";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PageHeader } from "@/components/layout/page-header";
import { formatCurrency, formatPercent, parseDateRange } from "@/lib/utils";
import { getDashboardData } from "@/services/dashboard-service";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = parseDateRange(params.from, params.to);
  const { overview, products, categories, isSampleData, message } =
    await getDashboardData(range);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live profitability metrics from Supabase"
      />

      <DataBanner isSampleData={isSampleData} message={message} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          title="Advertising Cost"
          value={formatCurrency(overview.advertising)}
          icon={Megaphone}
          variant="warning"
        />
        <MetricCard
          title="Return Rate"
          value={formatPercent(overview.returnRate)}
          subtitle={`${overview.unitsReturned} of ${overview.unitsSold + overview.unitsReturned} units`}
          icon={RotateCcw}
          variant={overview.returnRate > 10 ? "danger" : "default"}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Commission Cost"
          value={formatCurrency(overview.commission)}
          icon={Percent}
        />
        <MetricCard
          title="Logistics Cost"
          value={formatCurrency(overview.logistics)}
          icon={Truck}
        />
        <MetricCard
          title="Storage Cost"
          value={formatCurrency(overview.storage)}
          icon={Warehouse}
        />
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

      <div className="mt-8 space-y-8">
        <ProductProfitabilityTable products={products} isSampleData={isSampleData} />
        <CategoryProfitabilityTable categories={categories} isSampleData={isSampleData} />
      </div>
    </>
  );
}
