import { ChartCard } from "@/components/dashboard/chart-card";
import { DataBanner } from "@/components/dashboard/data-banner";
import { ProductProfitabilityTable } from "@/components/dashboard/product-profitability-table";
import { ProfitBarChart } from "@/components/dashboard/profit-bar-chart";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getDashboardData } from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const { products, isSampleData, message } = await getDashboardData(scope);

  const profitChartData = products.slice(0, 15).map((p) => ({
    label: p.modelCode,
    value: p.netProfit,
  }));

  const revenueChartData = products.slice(0, 15).map((p) => ({
    label: p.modelCode,
    value: p.revenue,
    secondary: p.netProfit,
  }));

  const returnRateChartData = products
    .filter((p) => p.unitsSold + p.unitsReturned > 0)
    .slice(0, 15)
    .map((p) => ({
      label: p.modelCode,
      value: p.returnRate,
    }));

  const adCostChartData = products
    .filter((p) => p.advertising > 0)
    .slice(0, 15)
    .map((p) => ({
      label: p.modelCode,
      value: p.advertising,
    }));

  return (
    <>
      <PageHeader
        title="Product Profitability"
        description="Performance breakdown by supplier article (артикул)"
      />

      <DataBanner isSampleData={isSampleData} message={message} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Profit by Supplier Article" description="Top 15 products by net profit">
          <ProfitBarChart data={profitChartData} valueLabel="Net Profit" color="#22c55e" />
        </ChartCard>

        <ChartCard title="Revenue by Supplier Article" description="Top 15 products by revenue">
          <ProfitBarChart
            data={revenueChartData}
            valueLabel="Revenue"
            secondaryLabel="Net Profit"
            color="#8b5cf6"
            secondaryColor="#22c55e"
          />
        </ChartCard>

        <ChartCard
          title="Return Rate by Supplier Article"
          description="Products with highest return rates"
        >
          <ProfitBarChart
            data={returnRateChartData}
            valueLabel="Return Rate"
            color="#ef4444"
            valueFormat="percent"
          />
        </ChartCard>

        <ChartCard
          title="Advertising Cost by Supplier Article"
          description="Ad spend distribution across products"
        >
          <ProfitBarChart data={adCostChartData} valueLabel="Ad Spend" color="#ec4899" />
        </ChartCard>
      </div>

      <div className="mt-8">
        <ProductProfitabilityTable products={products} isSampleData={isSampleData} />
      </div>
    </>
  );
}
