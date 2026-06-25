import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { fetchAllInDateRange, fetchAllRows } from "@/lib/supabase/paginate";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  buildCostBreakdown,
  buildLatestCostByProductId,
  buildProfitBreakdown,
  groupSalesByDate,
} from "@/lib/profit-calculator";
import { buildOrdersPurchasesKpis } from "@/lib/orders-purchases-metrics";
import {
  attributeProductFinance,
  buildPurchaseSridSet,
} from "@/lib/product-logistics-attribution";
import { buildProductFunnelMetrics } from "@/lib/product-funnel-metrics";
import { buildProfitabilityV2 } from "@/lib/profitability-v2";
import { getSampleDashboard, type DashboardPayload } from "@/lib/sample-data";
import type {
  CategoryProfitability,
  DateRange,
  OverviewMetrics,
  ProductCostHistory,
  ProductProfitability,
  ProductWithRelations,
  WbAd,
  WbFinance,
  WbOrder,
  WbSale,
} from "@/types/database";

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createServerClient();
}

async function isDatabaseEmpty(client: SupabaseClient): Promise<boolean> {
  const [sales, finance, ads, products] = await Promise.all([
    client.from("wb_sales").select("id", { count: "exact", head: true }),
    client.from("wb_finance").select("id", { count: "exact", head: true }),
    client.from("wb_ads").select("id", { count: "exact", head: true }),
    client.from("products").select("id", { count: "exact", head: true }),
  ]);

  const total =
    (sales.count ?? 0) + (finance.count ?? 0) + (ads.count ?? 0) + (products.count ?? 0);

  return total === 0;
}

export async function fetchProductsWithRelations(
  client?: SupabaseClient
): Promise<ProductWithRelations[]> {
  const supabase = getClient(client);

  const { data, error } = await supabase
    .from("products")
    .select("*, brand:brands(*), category:categories(*)");

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data ?? []) as ProductWithRelations[];
}

export async function fetchOrdersInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbOrder[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbOrder>(supabase, "wb_orders", {
    column: "order_date",
    from: range.from,
    to: range.to,
  });
}

export async function fetchSalesInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbSale[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbSale>(supabase, "wb_sales", {
    column: "sale_date",
    from: range.from,
    to: range.to,
  });
}

export async function fetchFinanceInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbFinance[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbFinance>(supabase, "wb_finance", {
    column: "operation_date",
    from: range.from,
    to: range.to,
  });
}

export async function fetchAdsInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbAd[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbAd>(supabase, "wb_ads", {
    column: "campaign_date",
    from: range.from,
    to: range.to,
  });
}

export async function fetchCostHistory(client?: SupabaseClient) {
  const supabase = getClient(client);
  return fetchAllRows<ProductCostHistory>(supabase, "product_cost_history", {
    column: "effective_from",
    ascending: false,
  });
}

export async function getOverviewMetrics(
  range: DateRange,
  client?: SupabaseClient
): Promise<OverviewMetrics> {
  const [sales, finance, ads, costHistory, products, orders] = await Promise.all([
    fetchSalesInRange(range, client),
    fetchFinanceInRange(range, client),
    fetchAdsInRange(range, client),
    fetchCostHistory(client),
    fetchProductsWithRelations(client),
    fetchOrdersInRange(range, client),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const breakdown = buildProfitBreakdown({
    sales,
    finance,
    ads,
    costHistory,
    latestCostByProductId,
    auditRange: range,
  });
  const dailyRevenue = groupSalesByDate(sales, costHistory, finance, latestCostByProductId);
  const costBreakdown = buildCostBreakdown(breakdown);
  const ordersPurchases = buildOrdersPurchasesKpis(orders, sales);
  const profitabilityV2 = buildProfitabilityV2(breakdown);

  return {
    ...breakdown,
    dailyRevenue,
    costBreakdown,
    ordersPurchases,
    profitabilityV2,
  };
}

export async function getProductProfitability(
  range: DateRange,
  client?: SupabaseClient
): Promise<ProductProfitability[]> {
  const [products, orders, sales, finance, ads, costHistory] = await Promise.all([
    fetchProductsWithRelations(client),
    fetchOrdersInRange(range, client),
    fetchSalesInRange(range, client),
    fetchFinanceInRange(range, client),
    fetchAdsInRange(range, client),
    fetchCostHistory(client),
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
  range: DateRange,
  client?: SupabaseClient
): Promise<CategoryProfitability[]> {
  const productMetrics = await getProductProfitability(range, client);

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
export async function getDashboardData(range: DateRange): Promise<DashboardPayload> {
  const env = getSupabaseEnv();

  if (!env.isConfigured) {
    return getSampleDashboard(
      "Supabase is not configured. Copy .env.example to .env.local and add your credentials."
    );
  }

  try {
    const client = createServerClient();
    const empty = await isDatabaseEmpty(client);

    if (empty) {
      return getSampleDashboard(
        "Database tables are empty. Showing sample data until Wildberries data is synced."
      );
    }

    const [overview, products, categories] = await Promise.all([
      getOverviewMetrics(range, client),
      getProductProfitability(range, client),
      getCategoryProfitability(range, client),
    ]);

    const hasActivity =
      overview.revenue > 0 ||
      overview.advertising > 0 ||
      products.length > 0;

    if (!hasActivity) {
      return getSampleDashboard(
        "No data found for the selected date range. Showing sample placeholders."
      );
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
