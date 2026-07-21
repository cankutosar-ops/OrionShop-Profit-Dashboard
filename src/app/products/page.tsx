import { ChartCard } from "@/components/dashboard/chart-card";
import { ProfitBarChartLazy } from "@/components/dashboard/dashboard-charts-lazy";
import { DataBanner } from "@/components/dashboard/data-banner";
import { ProductProfitabilityTable } from "@/components/dashboard/product-profitability-table";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { getDashboardListData } from "@/services/dashboard-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ProductsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const { products, isSampleData, message } = await getDashboardListData(scope);

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
          <ProfitBarChartLazy data={profitChartData} valueLabel="Net Profit" colorIndex={2} />
        </ChartCard>

        <ChartCard title="Revenue by Supplier Article" description="Top 15 products by revenue">
          <ProfitBarChartLazy
            data={revenueChartData}
            valueLabel="Revenue"
            secondaryLabel="Net Profit"
            colorIndex={0}
            secondaryColorIndex={2}
          />
        </ChartCard>

        <ChartCard
          title="Return Rate by Supplier Article"
          description="Products with highest return rates"
        >
          <ProfitBarChartLazy
            data={returnRateChartData}
            valueLabel="Return Rate"
            colorIndex={4}
            valueFormat="percent"
          />
        </ChartCard>

        <ChartCard
          title="Advertising Cost by Supplier Article"
          description="Ad spend distribution across products"
        >
          <ProfitBarChartLazy data={adCostChartData} valueLabel="Ad Spend" colorIndex={3} />
        </ChartCard>
      </div>

      <div className="mt-8">
        <ProductProfitabilityTable products={products} isSampleData={isSampleData} />
      </div>
    </>
  );
}
