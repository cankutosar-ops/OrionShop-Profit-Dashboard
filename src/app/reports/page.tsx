import { Suspense } from "react";
import {
  BusinessReportCard,
  ComingSoonReportCard,
} from "@/components/reports/business-report-card";
import { MarketplaceIntelligenceCard } from "@/components/reports/marketplace-intelligence-card";
import { ProductReportCard } from "@/components/reports/product-report-card";
import { ReportsHeader } from "@/components/reports/reports-header";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { calculateModelBMarginPercent } from "@/lib/financial-engine";
import {
  inferPeriodPreset,
  periodPresetLabel,
} from "@/lib/reports/report-period";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { formatLastSyncTimestamp } from "@/lib/marketplace-sync-date";
import { getBrandsForMarketplaceAccount } from "@/services/brand-service";
import {
  getOverviewMetrics,
  getProductProfitability,
} from "@/services/dashboard-service";
import {
  getCompanyById,
  getMarketplaceAccountSyncState,
} from "@/services/marketplace-account-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const hrefWithScope = (href: string) =>
    scopeQuery ? `${href}?${scopeQuery}` : href;

  const scope = await resolveScopedDateRange(params);
  const [overview, products, company, syncState, brands] = await Promise.all([
    getOverviewMetrics(scope).catch(() => null),
    getProductProfitability(scope).catch(() => []),
    getCompanyById(scope.companyId),
    getMarketplaceAccountSyncState(scope.marketplaceAccountId),
    scope.brandId
      ? getBrandsForMarketplaceAccount(scope.marketplaceAccountId)
      : Promise.resolve([]),
  ]);

  const currency = company?.currency?.trim() || "RUB";
  const brandLabel = scope.brandId
    ? brands.find((b) => b.id === scope.brandId)?.name ?? scope.brandId
    : null;

  const preset = inferPeriodPreset(scope.from, scope.to);
  const periodLabel = `${scope.from} → ${scope.to} · ${periodPresetLabel(preset)}`;
  const lastSyncLabel = syncState?.last_successful_sync_at
    ? formatLastSyncTimestamp(syncState.last_successful_sync_at)
    : "—";

  const hasKpis =
    overview &&
    (overview.revenue !== 0 ||
      overview.netProfit !== 0 ||
      overview.ordersPurchases.ordersCount !== 0);

  const productsWithSales = products.filter(
    (p) => p.purchases > 0 || p.revenue > 0 || p.unitsSold > 0
  ).length;
  const productRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  const productProfit = products.reduce((sum, p) => sum + p.finalNetProfit, 0);
  const averageMargin =
    productRevenue > 0
      ? calculateModelBMarginPercent(productRevenue, productProfit)
      : null;
  const hasProductKpis =
    products.length > 0 &&
    (productRevenue !== 0 || productsWithSales !== 0);

  return (
    <>
      <ReportsHeader
        title="Reports"
        description="Management reporting workspace — professional documents from trusted dashboard data"
      />

      <div className="space-y-6">
        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
          }
        >
          <BusinessReportCard
            previewHref={hrefWithScope("/reports/business")}
            periodLabel={periodLabel}
            lastSyncLabel={lastSyncLabel}
            lastGeneratedLabel="On export"
            brandLabel={brandLabel}
            kpis={
              hasKpis && overview
                ? {
                    revenue: overview.revenue,
                    profit: overview.netProfit,
                    orders: overview.ordersPurchases.ordersCount,
                    conversion: overview.ordersPurchases.conversionRate,
                    currency,
                  }
                : null
            }
          />
        </Suspense>

        <MarketplaceIntelligenceCard
          previewHref={hrefWithScope("/reports/marketplace")}
          periodLabel={periodLabel}
          lastSyncLabel={lastSyncLabel}
        />

        <Suspense
          fallback={
            <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
          }
        >
          <ProductReportCard
            previewHref={hrefWithScope("/reports/product")}
            periodLabel={periodLabel}
            lastSyncLabel={lastSyncLabel}
            lastGeneratedLabel="On export"
            brandLabel={brandLabel}
            kpis={
              hasProductKpis
                ? {
                    products: products.length,
                    productsWithSales,
                    revenue: productRevenue,
                    averageMargin,
                    currency,
                  }
                : null
            }
          />
        </Suspense>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Upcoming reports
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <ComingSoonReportCard
              name="Financial Report"
              description="Settlement, Model B, and finance category packs."
            />
            <ComingSoonReportCard
              name="Inventory Report"
              description="Stock health, warehouse, and inventory value pack."
            />
            <ComingSoonReportCard
              name="Executive Report"
              description="Leadership composite of company KPIs and risks."
            />
          </div>
        </section>

        <p className="text-xs text-muted-foreground">
          Legacy Product Profit preview remains available at{" "}
          <a
            href={hrefWithScope("/reports/product-profit")}
            className="text-primary hover:underline"
          >
            /reports/product-profit
          </a>
          .
        </p>
      </div>
    </>
  );
}
