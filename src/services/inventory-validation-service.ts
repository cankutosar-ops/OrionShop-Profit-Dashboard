/**
 * Validation-only — compares WB API (Seller Panel source) → wb_stock → inventory service.
 * Not used during page rendering or sync writes.
 */

import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import {
  buildInventoryRowKey,
  buildVariantKeys,
  indexProductsById,
  indexVariantsByProduct,
  mapApiStockRowKey,
  mapApiStockRowToInventory,
  mapDbStockRowToInventory,
  mapWbStockRowKey,
} from "@/lib/inventory-mapping";
import type { InventoryStockRow, InventoryValidationResult } from "@/lib/inventory-types";
import { WbApiClient } from "@/lib/wildberries/api-client";
import type { WbApiStockRow } from "@/lib/wildberries/types";
import { getInventoryForAccount } from "@/services/inventory-service";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
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

function buildNmIdToProductId(products: Product[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const product of products) {
    map.set(product.nm_id, String(product.id));
  }
  return map;
}

/** Live WB API fetch — validation and sync only. */
export async function fetchWildberriesStockFromApi(
  marketplaceAccountId: string
): Promise<{ apiRows: WbApiStockRow[]; inventoryRows: InventoryStockRow[] }> {
  const account = await getMarketplaceAccountForSync(marketplaceAccountId);
  if (account.marketplace !== "wildberries") {
    throw new Error(`Stock API validation not implemented for ${account.marketplace}`);
  }

  const client = await createServerClient();
  const products = await fetchProductsForAccount(marketplaceAccountId, client);
  const nmIdToProductId = buildNmIdToProductId(products);
  const apiClient = new WbApiClient(account.apiKey);
  const apiRows = await apiClient.fetchStocks();

  const inventoryRows: InventoryStockRow[] = [];
  for (const row of apiRows) {
    if (!row.nmId) continue;
    const productId = nmIdToProductId.get(row.nmId);
    if (!productId) continue;
    inventoryRows.push(
      mapApiStockRowToInventory(row, {
        productId,
        marketplaceAccountId,
        syncedAt: row.lastChangeDate ?? null,
      })
    );
  }

  return { apiRows, inventoryRows };
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
 * Full chain: WB API → wb_stock → inventory service.
 * All quantity fields must match on overlapping keys.
 */
export async function validateInventoryDataChain(
  marketplaceAccountId: string,
  client?: SupabaseClient
): Promise<InventoryValidationResult> {
  const supabase = await getClient(client);
  const [products, variants, stockRows, { apiRows, inventoryRows: apiInventoryRows }] =
    await Promise.all([
      fetchProductsForAccount(marketplaceAccountId, supabase),
      fetchVariantsForAccount(marketplaceAccountId, supabase),
      fetchStockRowsForAccount(marketplaceAccountId, supabase),
      fetchWildberriesStockFromApi(marketplaceAccountId),
    ]);

  const productsById = indexProductsById(products);
  const nmIdToProductId = buildNmIdToProductId(products);
  const serviceRows = await getInventoryForAccount(marketplaceAccountId, supabase);

  const wbStockMismatches: FieldMismatch[] = [];
  const serviceMismatches: FieldMismatch[] = [];

  const apiByKey = new Map(
    apiRows
      .filter((row) => row.nmId && nmIdToProductId.has(row.nmId))
      .map((row) => [mapApiStockRowKey(row, nmIdToProductId.get(row.nmId!)!), row])
  );

  const dbByKey = new Map(stockRows.map((row) => [mapWbStockRowKey(row), row]));
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

  for (const [key, apiRow] of apiByKey) {
    const productId = nmIdToProductId.get(apiRow.nmId!)!;
    const dbRow = dbByKey.get(key);
    if (!dbRow) continue;

    pushMismatch(
      wbStockMismatches,
      key,
      "quantity",
      Number(apiRow.quantity ?? 0),
      Number(dbRow.quantity ?? 0)
    );
    pushMismatch(
      wbStockMismatches,
      key,
      "quantity_full",
      Number(apiRow.quantityFull ?? apiRow.quantity ?? 0),
      Number(dbRow.quantity_full ?? 0)
    );
    pushMismatch(
      wbStockMismatches,
      key,
      "in_way_to_client",
      Number(apiRow.inWayToClient ?? 0),
      Number(dbRow.in_way_to_client ?? 0)
    );
    pushMismatch(
      wbStockMismatches,
      key,
      "in_way_from_client",
      Number(apiRow.inWayFromClient ?? 0),
      Number(dbRow.in_way_from_client ?? 0)
    );

    const apiInv = mapApiStockRowToInventory(apiRow, {
      productId,
      marketplaceAccountId,
    });
    const serviceRow = serviceByKey.get(key);
    if (!serviceRow) continue;

    for (const field of ["availableStock", "currentStock", "reservedStock"] as const) {
      pushMismatch(serviceMismatches, key, field, apiInv[field], serviceRow[field]);
    }
  }

  const skuMapping = analyzeSkuMapping(products, variants, stockRows);

  const matchedRows = [...apiByKey.keys()].filter((key) => dbByKey.has(key)).length;
  const mismatches = [...wbStockMismatches, ...serviceMismatches].slice(0, 30);

  const pass =
    stockRows.length > 0 &&
    apiRows.length > 0 &&
    wbStockMismatches.length === 0 &&
    serviceMismatches.length === 0 &&
    skuMapping.orphanStockRows === 0;

  return {
    pass,
    marketplaceAccountId,
    dbRowCount: stockRows.length,
    apiRowCount: apiInventoryRows.length,
    matchedRows,
    mismatches,
    wbStockMismatches: wbStockMismatches.slice(0, 20),
    skuMapping,
  };
}