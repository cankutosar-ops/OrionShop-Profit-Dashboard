/**
 * Validation — compares warehouse wb_stock → inventory service (Sprint 10.6).
 * No Marketplace HTTP. Live API comparison removed from business path.
 */

import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import {
  buildInventoryRowKey,
  buildVariantKeys,
  indexVariantsByProduct,
  mapDbStockRowToInventory,
  mapWbStockRowKey,
} from "@/lib/inventory-mapping";
import type { InventoryValidationResult } from "@/lib/inventory-types";
import { getInventoryForAccount } from "@/services/inventory-service";
import type { Product, ProductVariant, WbStock } from "@/types/database";

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
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

async function fetchVariantsForAccount(
  marketplaceAccountId: string,
  client: SupabaseClient
): Promise<ProductVariant[]> {
  const { data, error } = await client
    .from("product_variants")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId);

  if (error) throw new Error(`Failed to fetch variants: ${error.message}`);
  return (data ?? []) as ProductVariant[];
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

type FieldMismatch = InventoryValidationResult["mismatches"][number];

function pushMismatch(
  out: FieldMismatch[],
  key: string,
  field: string,
  expected: number,
  actual: number
) {
  if (expected !== actual) {
    out.push({ key, field, expected, actual });
  }
}

function analyzeSkuMapping(
  products: Product[],
  variants: ProductVariant[],
  stockRows: WbStock[]
): InventoryValidationResult["skuMapping"] {
  const variantsByProduct = indexVariantsByProduct(variants);
  const stockByProduct = new Map<string, WbStock[]>();

  for (const row of stockRows) {
    const productId = String(row.product_id);
    const list = stockByProduct.get(productId) ?? [];
    list.push(row);
    stockByProduct.set(productId, list);
  }

  let productsWithVariants = 0;
  let productsWithStock = 0;
  let orphanStockRows = 0;
  let variantsWithoutStock = 0;

  for (const product of products) {
    const productId = String(product.id);
    const productVariants = variantsByProduct.get(productId) ?? [];
    const productStock = stockByProduct.get(productId) ?? [];

    if (productVariants.length > 0) productsWithVariants += 1;
    if (productStock.length > 0) productsWithStock += 1;

    const variantKeys = buildVariantKeys(productVariants);
    for (const stockRow of productStock) {
      const stockKey = `${(stockRow.tech_size ?? "").trim()}|${stockRow.barcode ?? ""}`;
      const sizeOnly = (stockRow.tech_size ?? "").trim();
      const matchesVariant =
        variantKeys.has(stockKey) ||
        (sizeOnly && [...variantKeys].some((k) => k.startsWith(`${sizeOnly}|`)));
      if (productVariants.length > 0 && !matchesVariant && sizeOnly) {
        orphanStockRows += 1;
      }
    }

    for (const variantKey of variantKeys) {
      const [size] = variantKey.split("|");
      const hasStock = productStock.some((row) => (row.tech_size ?? "").trim() === size);
      if (!hasStock) variantsWithoutStock += 1;
    }
  }

  return {
    productsWithVariants,
    productsWithStock,
    orphanStockRows,
    variantsWithoutStock,
  };
}

/**
 * Warehouse chain: wb_stock → inventory service.
 * All quantity fields must match on overlapping keys.
 */
export async function validateInventoryDataChain(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<InventoryValidationResult> {
  const supabase = await getClient(client);
  const [products, variants, stockRows] = await Promise.all([
    fetchProductsForAccount(marketplaceAccountId, supabase),
    fetchVariantsForAccount(marketplaceAccountId, supabase),
    fetchStockRowsForAccount(marketplaceAccountId, supabase),
  ]);

  const serviceRows = await getInventoryForAccount(marketplaceAccountId, supabase);

  const serviceMismatches: FieldMismatch[] = [];

  const serviceByKey = new Map(
    serviceRows.map((row) => [
      buildInventoryRowKey({
        productId: row.productId,
        techSize: row.techSize,
        barcode: row.barcode,
        warehouse: row.warehouse,
      }),
      row,
    ])
  );

  let matchedRows = 0;
  for (const dbRow of stockRows) {
    const key = mapWbStockRowKey(dbRow);
    const expected = mapDbStockRowToInventory(dbRow);
    const serviceRow = serviceByKey.get(key);
    if (!serviceRow) continue;
    matchedRows += 1;

    for (const field of ["availableStock", "currentStock", "reservedStock"] as const) {
      pushMismatch(serviceMismatches, key, field, expected[field], serviceRow[field]);
    }
  }

  const skuMapping = analyzeSkuMapping(products, variants, stockRows);
  const mismatches = serviceMismatches.slice(0, 30);

  const pass =
    stockRows.length > 0 &&
    serviceMismatches.length === 0 &&
    skuMapping.orphanStockRows === 0;

  return {
    pass,
    marketplaceAccountId,
    dbRowCount: stockRows.length,
    apiRowCount: 0,
    matchedRows,
    mismatches,
    wbStockMismatches: [],
    skuMapping,
  };
}
