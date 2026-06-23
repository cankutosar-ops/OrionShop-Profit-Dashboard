import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  buildCostBreakdown,
  buildProfitBreakdown,
  groupSalesByDate,
} from "@/lib/profit-calculator";
import { getSampleDashboard, type DashboardPayload } from "@/lib/sample-data";
import type {
  CategoryProfitability,
  DateRange,
  OverviewMetrics,
  ProductProfitability,
  ProductWithRelations,
  WbAd,
  WbFinance,
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

export async function fetchSalesInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbSale[]> {
  const supabase = getClient(client);

  const { data, error } = await supabase
    .from("wb_sales")
    .select("*")
    .gte("sale_date", range.from)
    .lte("sale_date", range.to);

  if (error) throw new Error(`Failed to fetch sales: ${error.message}`);
  return data ?? [];
}

export async function fetchFinanceInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbFinance[]> {
  const supabase = getClient(client);

  const { data, error } = await supabase
    .from("wb_finance")
    .select("*")
    .gte("operation_date", range.from)
    .lte("operation_date", range.to);

  if (error) throw new Error(`Failed to fetch finance records: ${error.message}`);
  return data ?? [];
}

export async function fetchAdsInRange(
  range: DateRange,
  client?: SupabaseClient
): Promise<WbAd[]> {
  const supabase = getClient(client);

  const { data, error } = await supabase
    .from("wb_ads")
    .select("*")
    .gte("campaign_date", range.from)
    .lte("campaign_date", range.to);

  if (error) throw new Error(`Failed to fetch ads: ${error.message}`);
  return data ?? [];
}

export async function fetchCostHistory(client?: SupabaseClient) {
  const supabase = getClient(client);

  const { data, error } = await supabase
    .from("product_cost_history")
    .select("*")
    .order("effective_from", { ascending: false });

  if (error) throw new Error(`Failed to fetch cost history: ${error.message}`);
  return data ?? [];
}

export async function getOverviewMetrics(
  range: DateRange,
  client?: SupabaseClient
): Promise<OverviewMetrics> {
  const [sales, finance, ads, costHistory] = await Promise.all([
    fetchSalesInRange(range, client),
    fetchFinanceInRange(range, client),
    fetchAdsInRange(range, client),
    fetchCostHistory(client),
  ]);

  const breakdown = buildProfitBreakdown({ sales, finance, ads, costHistory });
  const dailyRevenue = groupSalesByDate(sales, costHistory, finance);
  const costBreakdown = buildCostBreakdown(breakdown);

  return {
    ...breakdown,
    dailyRevenue,
    costBreakdown,
  };
}

export async function getProductProfitability(
  range: DateRange,
  client?: SupabaseClient
): Promise<ProductProfitability[]> {
  const [products, sales, finance, ads, costHistory] = await Promise.all([
    fetchProductsWithRelations(client),
    fetchSalesInRange(range, client),
    fetchFinanceInRange(range, client),
    fetchAdsInRange(range, client),
    fetchCostHistory(client),
  ]);

  const productCostHistory = new Map<string, typeof costHistory>();
  for (const entry of costHistory) {
    const existing = productCostHistory.get(entry.product_id) ?? [];
    existing.push(entry);
    productCostHistory.set(entry.product_id, existing);
  }

  return products
    .map((product) => {
      const productSales = sales.filter((s) => s.product_id === product.id);
      const productFinance = finance.filter((f) => f.product_id === product.id);
      const productAds = ads.filter(
        (a) =>
          a.product_id === product.id || a.supplier_article === product.supplier_article
      );
      const productCosts = productCostHistory.get(product.id) ?? [];

      const breakdown = buildProfitBreakdown({
        sales: productSales,
        finance: productFinance,
        ads: productAds,
        costHistory: productCosts,
      });

      return {
        ...breakdown,
        productId: product.id,
        modelCode: product.supplier_article,
        productName: product.name,
        categoryName: product.category?.name ?? "Uncategorized",
        brandName: product.brand?.name ?? "Unknown",
      };
    })
    .filter((p) => p.revenue > 0 || p.advertising > 0)
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
