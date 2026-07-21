import { ChartCard } from "@/components/dashboard/chart-card";
import { ProfitBarChartLazy } from "@/components/dashboard/dashboard-charts-lazy";
import { DataBanner } from "@/components/dashboard/data-banner";
import { ProfitabilityGroupedTable } from "@/components/dashboard/profitability-grouped-table";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { cn, formatCurrency } from "@/lib/utils";
import { getDashboardListData } from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function CategoriesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const { categories, brands, isSampleData, message } = await getDashboardListData(scope);

  const profitChartData = categories.map((c) => ({
    label: c.name,
    value: c.finalNetProfit,
  }));

  const revenueChartData = categories.map((c) => ({
    label: c.name,
    value: c.revenue,
    secondary: c.finalNetProfit,
  }));

  const totalRevenue = categories.reduce((sum, c) => sum + c.revenue, 0);
  const totalProfit = categories.reduce((sum, c) => sum + c.finalNetProfit, 0);

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
          <ProfitBarChartLazy data={profitChartData} valueLabel="Net Profit" colorIndex={2} />
        </ChartCard>

        <ChartCard title="Revenue by Category" description="Revenue and profit comparison">
          <ProfitBarChartLazy
            data={revenueChartData}
            valueLabel="Revenue"
            secondaryLabel="Net Profit"
            colorIndex={0}
            secondaryColorIndex={2}
          />
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
