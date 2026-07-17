import {
  buildSkuDisplayRows,
  collectCatalogVariantGroups,
} from "@/lib/product-sku-analytics";
import {
  buildBarcodeToTechSizeMap,
  dedupeVariantsBySize,
  enrichRowsWithTechSize,
} from "@/lib/product-variant-resolve";
import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type {
  ProductSkuAnalyticsResponse,
  ProductVariant,
  ScopedDateRange,
  WbOrder,
  WbSale,
} from "@/types/database";
import { fetchProductsWithRelations } from "@/services/persisted-query-service";
import { fetchStockForProduct } from "@/services/stock-service";

async function fetchOrdersForProduct(
  productId: string,
  marketplaceAccountId: string,
  range: ScopedDateRange
): Promise<WbOrder[]> {
  const client = createServerClient();
  const { data, error } = await client
    .from("wb_orders")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .eq("product_id", productId)
    .gte("order_date", range.from)
    .lte("order_date", range.to);

  if (error) throw new Error(`Failed to fetch product orders: ${error.message}`);
  return (data ?? []) as WbOrder[];
}

async function fetchSalesForProduct(
  productId: string,
  marketplaceAccountId: string,
  range: ScopedDateRange
): Promise<WbSale[]> {
  const client = createServerClient();
  const { data, error } = await client
    .from("wb_sales")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .eq("product_id", productId)
    .gte("sale_date", range.from)
    .lte("sale_date", range.to);

  if (error) throw new Error(`Failed to fetch product sales: ${error.message}`);
  return (data ?? []) as WbSale[];
}

async function fetchVariants(productId: string, marketplaceAccountId: string): Promise<ProductVariant[]> {
  const client = createServerClient();
  const { data, error } = await client
    .from("product_variants")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(`Failed to fetch variants: ${error.message}`);
  }
  return dedupeVariantsBySize((data ?? []) as ProductVariant[]);
}

export async function getProductSkuAnalytics(
  productId: string,
  scope: ScopedDateRange,
  _cohortMaxOrders: number
): Promise<ProductSkuAnalyticsResponse | null> {
  const startedAt = Date.now();
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
  });
  const normalizedProductId = String(productId);
  const product = products.find((p) => String(p.id) === normalizedProductId);
  if (!product) return null;

  const [dbOrders, dbSales, variants, stockRows] = await Promise.all([
    fetchOrdersForProduct(normalizedProductId, scope.marketplaceAccountId, scope),
    fetchSalesForProduct(normalizedProductId, scope.marketplaceAccountId, scope),
    fetchVariants(normalizedProductId, scope.marketplaceAccountId),
    fetchStockForProduct(normalizedProductId, scope.marketplaceAccountId, client),
  ]);

  const barcodeMap = buildBarcodeToTechSizeMap(variants);
  const orders = enrichRowsWithTechSize(dbOrders, barcodeMap);
  const sales = enrichRowsWithTechSize(dbSales, barcodeMap);

  const groups = collectCatalogVariantGroups(variants);
  const skus = buildSkuDisplayRows(groups, orders, sales, stockRows);

  return {
    productId: normalizedProductId,
    supplierArticle: product.supplier_article,
    skus,
    loadTimeMs: Date.now() - startedAt,
  };
}

export async function getCohortMaxOrders(scope: ScopedDateRange): Promise<number> {
  const client = createServerClient();
  const { data, error } = await client
    .from("wb_orders")
    .select("quantity, product_id")
    .eq("marketplace_account_id", scope.marketplaceAccountId);

  if (error) return 0;

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const key = String(row.product_id);
    totals.set(key, (totals.get(key) ?? 0) + Number(row.quantity ?? 0));
  }
  return Math.max(0, ...Array.from(totals.values()));
}
