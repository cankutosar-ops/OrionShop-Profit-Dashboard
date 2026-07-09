import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  buildCostBreakdown,
  buildProfitBreakdown,
  groupSalesByDate,
} from "@/lib/profit-calculator";
import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import { buildOrdersPurchasesKpis } from "@/lib/orders-purchases-metrics";
import {
  attributeProductFinance,
  buildPurchaseSridSet,
} from "@/lib/product-logistics-attribution";
import { buildProductFunnelMetrics } from "@/lib/product-funnel-metrics";
import { buildMarketplaceFeesPresentation } from "@/lib/marketplace-fees-presentation";
import { buildProfitabilityV2 } from "@/lib/profitability-v2";
import { getSampleDashboard, getEmptyPeriodDashboard, type DashboardPayload } from "@/lib/sample-data";
import {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import type {
  CategoryProfitability,
  OverviewMetrics,
  ProductProfitability,
  ScopedDateRange,
} from "@/types/database";

export {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";

async function isDatabaseEmpty(client: SupabaseClient, marketplaceAccountId: string): Promise<boolean> {
  const [sales, finance, ads, products] = await Promise.all([
    client
      .from("wb_sales")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
    client
      .from("wb_finance")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
    client.from("wb_ads").select("id", { count: "exact", head: true }),
    client
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
  ]);

  const total =
    (sales.count ?? 0) + (finance.count ?? 0) + (ads.count ?? 0) + (products.count ?? 0);

  return total === 0;
}

async function fetchAccountLastSync(
  client: SupabaseClient,
  marketplaceAccountId: string
): Promise<string | null> {
  const { data } = await client
    .from("marketplace_accounts")
    .select("last_successful_sync_at, last_sync_at")
    .eq("id", marketplaceAccountId)
    .maybeSingle();

  return data?.last_successful_sync_at ?? data?.last_sync_at ?? null;
}

export async function getOverviewMetrics(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<OverviewMetrics> {
  const [sales, finance, ads, costHistory, products, orders] = await Promise.all([
    fetchSalesInRange(scope, client),
    fetchFinanceInRange(scope, client),
    fetchAdsInRange(scope, client),
    fetchCostHistory(scope.marketplaceAccountId, client),
    fetchProductsWithRelations(scope.marketplaceAccountId, client),
    fetchOrdersInRange(scope, client),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const breakdown = buildProfitBreakdown({
    sales,
    finance,
    ads,
    costHistory,
    latestCostByProductId,
    auditRange: scope,
  });
  const dailyRevenue = groupSalesByDate(sales, costHistory, finance, latestCostByProductId);
  const costBreakdown = buildCostBreakdown(breakdown);
  const ordersPurchases = buildOrdersPurchasesKpis(orders, sales);
  const profitabilityV2 = buildProfitabilityV2(breakdown);
  const marketplaceFeesPresentation = buildMarketplaceFeesPresentation(finance, breakdown.commission);

  return {
    ...breakdown,
    dailyRevenue,
    costBreakdown,
    ordersPurchases,
    profitabilityV2,
    marketplaceFeesPresentation,
  };
}

export async function getProductProfitability(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<ProductProfitability[]> {
  const [products, orders, sales, finance, ads, costHistory] = await Promise.all([
    fetchProductsWithRelations(scope.marketplaceAccountId, client),
    fetchOrdersInRange(scope, client),
    fetchSalesInRange(scope, client),
    fetchFinanceInRange(scope, client),
    fetchAdsInRange(scope, client),
    fetchCostHistory(scope.marketplaceAccountId, client),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);

  return products
    .map((product) => {
      const productOrders = orders.filter((o) => String(o.product_id) === String(product.id));
      const productSales = sales.filter((s) => String(s.product_id) === String(product.id));
      const productFinance = finance.filter((f) => String(f.product_id) === String(product.id));
      const productAds = ads.filter(
        (a) =>
          String(a.product_id) === String(product.id) ||
          a.supplier_article === product.supplier_article
      );

      const funnel = buildProductFunnelMetrics(productOrders, productSales);
      const purchaseSrids = buildPurchaseSridSet(productSales);
      const {
        financeForBreakdown,
        purchaseLogisticsRows,
        excludedLogisticsRows,
        excludedLogistics,
      } = attributeProductFinance(productFinance, purchaseSrids);

      const breakdown = buildProfitBreakdown({
        sales: productSales,
        finance: financeForBreakdown,
        ads: productAds,
        costHistory: [],
        latestCostByProductId,
      });

      return {
        ...breakdown,
        productId: String(product.id),
        modelCode: product.supplier_article,
        productName: product.name,
        categoryName: product.category?.name ?? "Uncategorized",
        brandName: product.brand?.name ?? "Unknown",
        orders: funnel.orders,
        purchases: funnel.purchases,
        conversionPercent: funnel.conversionPercent,
        cancelled: funnel.cancelled,
        cancellationPercent: funnel.cancellationPercent,
        purchaseLogistics: breakdown.logistics,
        excludedLogistics,
        purchaseLogisticsRows,
        excludedLogisticsRows,
      };
    })
    .filter(
      (p) =>
        p.orders > 0 ||
        p.purchases > 0 ||
        p.revenue > 0 ||
        p.advertising > 0
    )
    .sort((a, b) => b.netProfit - a.netProfit);
}

export async function getCategoryProfitability(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<CategoryProfitability[]> {
  const productMetrics = await getProductProfitability(scope, client);

  const categoryMap = new Map<
    string,
    CategoryProfitability & { _totalUnits: number; _returnedUnits: number }
  >();

  for (const product of productMetrics) {
    const categoryName = product.categoryName;
    const existing = categoryMap.get(categoryName) ?? {
      categoryId: categoryName,
      categoryName,
      revenue: 0,
      netProfit: 0,
      productCount: 0,
      returnRate: 0,
      _totalUnits: 0,
      _returnedUnits: 0,
    };

    existing.revenue += product.revenue;
    existing.netProfit += product.netProfit;
    existing.productCount += 1;
    existing._totalUnits += product.unitsSold + product.unitsReturned;
    existing._returnedUnits += product.unitsReturned;

    categoryMap.set(categoryName, existing);
  }

  return Array.from(categoryMap.values())
    .map(({ _totalUnits, _returnedUnits, ...cat }) => ({
      ...cat,
      returnRate: _totalUnits > 0 ? (_returnedUnits / _totalUnits) * 100 : 0,
    }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Loads all dashboard data from Supabase.
 * Falls back to sample placeholders when Supabase is not configured or tables are empty.
 */
export async function getDashboardData(scope: ScopedDateRange): Promise<DashboardPayload> {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return getSampleDashboard(
      "Supabase is not configured. Copy .env.example to .env.local and add your credentials."
    );
  }

  try {
    const client = createServerClient();
    const empty = await isDatabaseEmpty(client, scope.marketplaceAccountId);

    if (empty) {
      return getSampleDashboard(
        "Database tables are empty. Showing sample data until Wildberries data is synced."
      );
    }

    const [overview, products, categories] = await Promise.all([
      getOverviewMetrics(scope, client),
      getProductProfitability(scope, client),
      getCategoryProfitability(scope, client),
    ]);

    const hasActivity =
      overview.revenue > 0 ||
      overview.advertising > 0 ||
      products.length > 0;

    if (!hasActivity) {
      const lastSyncAt = await fetchAccountLastSync(client, scope.marketplaceAccountId);
      return getEmptyPeriodDashboard(lastSyncAt);
    }

    return {
      overview,
      products,
      categories,
      isSampleData: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to Supabase";

    return getSampleDashboard(
      `Could not load live data: ${message}. Showing sample placeholders.`
    );
  }
}
