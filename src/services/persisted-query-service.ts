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

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

/** Read-only persisted data access shared by Dashboard and Reports. */
export async function fetchProductsWithRelations(
  marketplaceAccountId: string,
  client?: SupabaseClient,
  options?: { brandId?: string; columns?: string }
): Promise<ProductWithRelations[]> {
  const supabase = await getClient(client);

  let query = supabase
    .from("products")
    .select(options?.columns ?? "*, brand:brands(*), category:categories(*)")
    .eq("marketplace_account_id", marketplaceAccountId);
  if (options?.brandId) {
    query = query.eq("brand_id", options.brandId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data ?? []) as unknown as ProductWithRelations[];
}

export async function fetchOrdersInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient,
  options?: { productIds?: string[]; columns?: string }
): Promise<WbOrder[]> {
  const supabase = await getClient(client);
  return fetchAllInDateRange<WbOrder>(supabase, "wb_orders", {
    column: "order_date",
    from: scope.from,
    to: scope.to,
    marketplaceAccountId: scope.marketplaceAccountId,
    selectColumns: options?.columns,
    inFilters: options?.productIds
      ? [{ column: "product_id", values: options.productIds }]
      : undefined,
  });
}

export async function fetchSalesInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient,
  options?: { productIds?: string[]; columns?: string }
): Promise<WbSale[]> {
  const supabase = await getClient(client);
  return fetchAllInDateRange<WbSale>(supabase, "wb_sales", {
    column: "sale_date",
    from: scope.from,
    to: scope.to,
    marketplaceAccountId: scope.marketplaceAccountId,
    selectColumns: options?.columns,
    inFilters: options?.productIds
      ? [{ column: "product_id", values: options.productIds }]
      : undefined,
  });
}

function mergeFinanceRowsById(rows: WbFinance[]): WbFinance[] {
  const byId = new Map<string, WbFinance>();
  for (const row of rows) {
    byId.set(String(row.id), row);
  }
  return [...byId.values()];
}

export async function fetchFinanceInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient,
  options?: { productIds?: string[]; columns?: string }
): Promise<WbFinance[]> {
  const supabase = await getClient(client);
  const rangeFilter = {
    column: "operation_date" as const,
    from: scope.from,
    to: scope.to,
    marketplaceAccountId: scope.marketplaceAccountId,
    selectColumns: options?.columns,
  };

  if (!options?.productIds) {
    return fetchAllInDateRange<WbFinance>(supabase, "wb_finance", rangeFilter);
  }

  if (options.productIds.length === 0) {
    return fetchAllInDateRange<WbFinance>(supabase, "wb_finance", {
      ...rangeFilter,
      isNullFilters: ["product_id"],
    });
  }

  const [productLinked, accountLevel] = await Promise.all([
    fetchAllInDateRange<WbFinance>(supabase, "wb_finance", {
      ...rangeFilter,
      inFilters: [{ column: "product_id", values: options.productIds }],
    }),
    fetchAllInDateRange<WbFinance>(supabase, "wb_finance", {
      ...rangeFilter,
      isNullFilters: ["product_id"],
    }),
  ]);

  return mergeFinanceRowsById([...productLinked, ...accountLevel]);
}

/**
 * Account-wide latest wb_finance.operation_date (read-only data-quality helper).
 * Does not sync or recover Finance from Wildberries.
 */
export async function fetchLatestFinanceOperationDate(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<string | null> {
  const supabase = await getClient(client);
  const { data, error } = await supabase
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch latest finance operation_date: ${error.message}`);
  }
  if (!data?.operation_date) return null;
  return String(data.operation_date).slice(0, 10);
}

/**
 * Advertising spend for the scoped marketplace account.
 *
 * `wb_ads` has no `marketplace_account_id`. Matching by `supplier_article`
 * across the global table can attribute Account 1 spend to Account 2 (and
 * vice versa) when both catalogs share an article string.
 *
 * Isolation rule: only rows whose `product_id` belongs to this account
 * (and optional brand filter via the product id list). Orphan ads with
 * null `product_id` are excluded rather than guessed by article.
 *
 * `supplierArticles` is accepted for call-site compatibility and ignored.
 */
export async function fetchAdsInRange(
  scope: ScopedDateRange,
  client?: SupabaseClient,
  options?: { productIds?: string[]; supplierArticles?: string[]; columns?: string }
): Promise<WbAd[]> {
  const supabase = await getClient(client);
  const selectColumns = options?.columns;
  void options?.supplierArticles;

  let productIds = options?.productIds;
  if (!productIds) {
    const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
      brandId: scope.brandId,
      columns: "id, supplier_article, brand_id",
    });
    productIds = products.map((p) => String(p.id));
  }

  if (productIds.length === 0) return [];

  return fetchAllInDateRange<WbAd>(supabase, "wb_ads", {
    column: "campaign_date",
    from: scope.from,
    to: scope.to,
    selectColumns,
    inFilters: [{ column: "product_id", values: productIds }],
  });
}

export async function fetchCostHistory(
  marketplaceAccountId: string,
  client?: SupabaseClient,
  options?: { productIds?: string[]; columns?: string }
): Promise<ProductCostHistory[]> {
  const supabase = await getClient(client);
  const productIds =
    options?.productIds ??
    (
      await fetchProductsWithRelations(marketplaceAccountId, client, {
        columns: "id, supplier_article, brand_id",
      })
    ).map((p) => String(p.id));

  const rows = await fetchAllRows<ProductCostHistory>(supabase, "product_cost_history", {
    selectColumns: options?.columns,
    inFilters: [{ column: "product_id", values: productIds }],
    orderBy: { column: "effective_from", ascending: false },
  });
  return rows;
}
