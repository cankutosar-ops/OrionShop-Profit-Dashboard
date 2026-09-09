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
 * True once 20260909090000 has added `marketplace_account_id` to wb_ads.
 *
 * Probed rather than assumed so the read path keeps working on a database where
 * the migration has not been applied yet — the same fallback discipline the
 * finance sync uses for its extended columns.
 */
let wbAdsHasAccountColumn: boolean | null = null;

async function adsSchemaHasAccountColumn(supabase: SupabaseClient): Promise<boolean> {
  if (wbAdsHasAccountColumn !== null) return wbAdsHasAccountColumn;
  const { error } = await supabase.from("wb_ads").select("marketplace_account_id").limit(1);
  wbAdsHasAccountColumn = !error;
  return wbAdsHasAccountColumn;
}

/**
 * Advertising spend for the scoped marketplace account.
 *
 * Two independent isolation layers, because attributing one account's ad spend
 * to another silently corrupts Net Profit:
 *
 *   1. `marketplace_account_id`, once the column exists. This is the real guard.
 *   2. `product_id` restricted to this account's products, which also applies
 *      the brand filter. Orphan ads with a null `product_id` are excluded rather
 *      than guessed by article — article strings are only unique per account, so
 *      matching on them can pull in another account's rows.
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

  const accountScoped = await adsSchemaHasAccountColumn(supabase);

  return fetchAllInDateRange<WbAd>(supabase, "wb_ads", {
    column: "campaign_date",
    from: scope.from,
    to: scope.to,
    selectColumns,
    marketplaceAccountId: accountScoped ? scope.marketplaceAccountId : undefined,
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
