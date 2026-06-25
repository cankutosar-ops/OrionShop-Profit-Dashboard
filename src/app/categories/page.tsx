import { CategoryProfitabilityTable } from "@/components/dashboard/category-profitability-table";
import { ChartCard } from "@/components/dashboard/chart-card";
import { DataBanner } from "@/components/dashboard/data-banner";
import { ProfitBarChart } from "@/components/dashboard/profit-bar-chart";
import { PageHeader } from "@/components/layout/page-header";
import { cn, formatCurrency, parseDateRange } from "@/lib/utils";
import { getDashboardData } from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
};

export default async function CategoriesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = parseDateRange(params.from, params.to);
  const { categories, isSampleData, message } = await getDashboardData(range);

  const profitChartData = categories.map((c) => ({
    label: c.categoryName,
    value: c.netProfit,
  }));

  const revenueChartData = categories.map((c) => ({
    label: c.categoryName,
    value: c.revenue,
    secondary: c.netProfit,
  }));

  const totalRevenue = categories.reduce((sum, c) => sum + c.revenue, 0);
  const totalProfit = categories.reduce((sum, c) => sum + c.netProfit, 0);

  return (
    <>
      <PageHeader
        title="Category Profitability"
        description="Performance breakdown by product category"
      />

      <DataBanner isSampleData={isSampleData} message={message} />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Categories</p>
          <p className="mt-1 text-2xl font-bold">{categories.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-primary">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">Total Net Profit</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold",
              totalProfit >= 0 ? "text-success" : "text-danger"
            )}
          >
            {formatCurrency(totalProfit)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Profit by Category" description="Net profit across all categories">
          <ProfitBarChart data={profitChartData} valueLabel="Net Profit" color="#22c55e" />
        </ChartCard>

        <ChartCard title="Revenue by Category" description="Revenue and profit comparison">
          <ProfitBarChart
            data={revenueChartData}
            valueLabel="Revenue"
            secondaryLabel="Net Profit"
            color="#8b5cf6"
            secondaryColor="#22c55e"
          />
        </ChartCard>
      </div>

      <div className="mt-8">
        <CategoryProfitabilityTable categories={categories} isSampleData={isSampleData} />
      </div>
    </>
  );
}
