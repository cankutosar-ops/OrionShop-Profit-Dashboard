import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { fetchAllInDateRange, fetchAllRows } from "@/lib/supabase/paginate";
import type {
  ProductCostHistory,
  ProductWithRelations,
  ScopedDateRange,
  WbAd,
  WbFinance,
  WbOrder,
  WbSale,
} from "@/types/database";

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createServerClient();
}

/** Read-only persisted data access shared by Dashboard and Reports. */
export async function fetchProductsWithRelations(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<ProductWithRelations[]> {
  const supabase = getClient(client);

  const { data, error } = await supabase
    .from("products")
    .select("*, brand:brands(*), category:categories(*)")
    .eq("marketplace_account_id", marketplaceAccountId);

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data ?? []) as ProductWithRelations[];
}

export async function fetchOrdersInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<WbOrder[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbOrder>(supabase, "wb_orders", {
    column: "order_date",
    from: scope.from,
    to: scope.to,
    marketplaceAccountId: scope.marketplaceAccountId,
  });
}

export async function fetchSalesInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<WbSale[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbSale>(supabase, "wb_sales", {
    column: "sale_date",
    from: scope.from,
    to: scope.to,
    marketplaceAccountId: scope.marketplaceAccountId,
  });
}

export async function fetchFinanceInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<WbFinance[]> {
  const supabase = getClient(client);
  return fetchAllInDateRange<WbFinance>(supabase, "wb_finance", {
    column: "operation_date",
    from: scope.from,
    to: scope.to,
    marketplaceAccountId: scope.marketplaceAccountId,
  });
}

export async function fetchAdsInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<WbAd[]> {
  const supabase = getClient(client);
  const [ads, products] = await Promise.all([
    fetchAllInDateRange<WbAd>(supabase, "wb_ads", {
      column: "campaign_date",
      from: scope.from,
      to: scope.to,
    }),
    fetchProductsWithRelations(scope.marketplaceAccountId, client),
  ]);

  const productIds = new Set(products.map((p) => String(p.id)));
  const articles = new Set(products.map((p) => p.supplier_article));

  return ads.filter(
    (ad) =>
      (ad.product_id && productIds.has(String(ad.product_id))) ||
      (ad.supplier_article && articles.has(ad.supplier_article))
  );
}

export async function fetchCostHistory(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<ProductCostHistory[]> {
  const supabase = getClient(client);
  const products = await fetchProductsWithRelations(marketplaceAccountId, client);
  const productIds = new Set(products.map((p) => String(p.id)));

  const rows = await fetchAllRows<ProductCostHistory>(supabase, "product_cost_history", {
    orderBy: { column: "effective_from", ascending: false },
  });

  return rows.filter((row) => productIds.has(String(row.product_id)));
}
