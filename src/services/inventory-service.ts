import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { indexProductsById, mapDbStockRowToInventory } from "@/lib/inventory-mapping";
import type { InventoryStockRow } from "@/lib/inventory-types";
import type { Product, WbStock } from "@/types/database";

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createServerClient();
}

async function fetchProductsForAccount(
  marketplaceAccountId: string,
  client: SupabaseClient
): Promise<Product[]> {
  const { data, error } = await client
    .from("products")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId);

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data ?? []) as Product[];
}

async function fetchStockRowsForAccount(
  marketplaceAccountId: string,
  client: SupabaseClient
): Promise<WbStock[]> {
  const { data, error } = await client
    .from("wb_stock")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId);

  if (error) throw new Error(`Failed to fetch wb_stock: ${error.message}`);
  return (data ?? []) as WbStock[];
}

function mapDbStockRows(
  stockRows: WbStock[],
  productsById: Map<string, Product>
): InventoryStockRow[] {
  return stockRows.map((row) => {
    const product = productsById.get(String(row.product_id));
    return mapDbStockRowToInventory(row, {
      nmId: product?.nm_id ?? null,
      supplierArticle: product?.supplier_article ?? null,
    });
  });
}

/** All inventory rows for an account — database only. */
export async function getInventoryForAccount(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<InventoryStockRow[]> {
  const supabase = getClient(client);
  const [products, stockRows] = await Promise.all([
    fetchProductsForAccount(marketplaceAccountId, supabase),
    fetchStockRowsForAccount(marketplaceAccountId, supabase),
  ]);
  return mapDbStockRows(stockRows, indexProductsById(products));
}

/** Inventory rows for one product — database only. */
export async function getInventoryForProduct(
  productId: string,
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<InventoryStockRow[]> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from("wb_stock")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .eq("product_id", productId);

  if (error) throw new Error(`Failed to fetch product stock: ${error.message}`);

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("*")
    .eq("id", productId)
    .maybeSingle();

  if (productError) throw new Error(`Failed to fetch product: ${productError.message}`);

  const context = product
    ? { nmId: product.nm_id, supplierArticle: product.supplier_article }
    : {};

  return ((data ?? []) as WbStock[]).map((row) => mapDbStockRowToInventory(row, context));
}
