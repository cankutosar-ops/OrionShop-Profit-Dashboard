import { ProductAnalyticsTotalsSection } from "@/components/analytics/product-analytics-totals";
import { ProductAnalyticsV8Table } from "@/components/analytics/product-analytics-v8-table";
import { ProductAnalyticsV3Table } from "@/components/analytics/product-analytics-v3-table";
import { PageHeader } from "@/components/layout/page-header";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { formatDate } from "@/lib/utils";
import { getProductAnalytics } from "@/services/product-analytics-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ProductAnalyticsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const report = await getProductAnalytics(scope);

  return (
    <>
      <PageHeader
        title="Product Analytics"
        description="Operational funnel and unit economics by SKU — decision support, not financial reporting"
      />

      {!report ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to view product analytics.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <p>
              Period:{" "}
              <span className="font-medium text-foreground">
                {formatDate(scope.from)} → {formatDate(scope.to)}
              </span>
              {" · "}
              {report.v3All.length} SKUs with activity
            </p>
            <p className="mt-1.5 text-xs leading-relaxed">
              Operational profit = revenue − product cost − commission − total logistics − return
              logistics − marketing − other marketplace costs · Funnel and P&L are shown separately
              · Financial net profit unchanged on Dashboard
            </p>
          </div>

          <ProductAnalyticsTotalsSection totals={report.totals} />

          <ProductAnalyticsV8Table
            title="All Products"
            description={`${report.v3All.length} models sorted by operational profit · expand for SKU funnel · stock opens Inventory`}
            rows={report.v3All}
            rangeFrom={scope.from}
            rangeTo={scope.to}
          />

          <ProductAnalyticsV3Table
            layout="compact"
            title="Top 10 Winners"
            description="Highest operational profit in period"
            rows={report.v3Top10}
          />

          <ProductAnalyticsV3Table
            layout="compact"
            title="Bottom 10 Losers"
            description="Lowest operational profit — review pricing and costs"
            rows={report.v3Bottom10}
          />
        </div>
      )}
    </>
  );
}
