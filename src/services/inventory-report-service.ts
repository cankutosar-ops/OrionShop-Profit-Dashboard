import { getSupabaseEnv } from "@/lib/supabase/env";
import { createServerClient } from "@/lib/supabase/server";
import {
  aggregateStockByProduct,
  buildModelDetail,
  buildModelRow,
  countPurchasesByProduct,
  countPurchasesByProductAndSize,
  sortModelsByUrgency,
} from "@/lib/inventory-aggregation";
import type { InventoryReport } from "@/lib/inventory-types";
import { getDefaultDateRange } from "@/lib/utils";
import { fetchSalesInRange } from "@/services/persisted-query-service";
import { getInventoryForAccount } from "@/services/inventory-service";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import type { Product, ScopedDateRange } from "@/types/database";

type ProductWithCategory = Product & {
  category?: { id: string; name: string } | null;
};

async function fetchProductsForAccount(
  marketplaceAccountId: string
): Promise<ProductWithCategory[]> {
  const client = await createServerClient();
  // Same products query as before; category join is UI metadata only (filter labels).
  const { data, error } = await client
    .from("products")
    .select("*, category:categories(id, name)")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("supplier_article");

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data ?? []) as unknown as ProductWithCategory[];
}

function buildLast30Scope(scope: ScopedDateRange): ScopedDateRange {
  const to = scope.to || getDefaultDateRange().to;
  const end = new Date(to);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);

  return {
    ...scope,
    from: start.toISOString().split("T")[0],
    to,
  };
}

export async function getInventoryReport(scope: ScopedDateRange): Promise<InventoryReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const salesScope = buildLast30Scope(scope);

  const [inventoryRows, products, sales, account] = await Promise.all([
    getInventoryForAccount(scope.marketplaceAccountId, client),
    fetchProductsForAccount(scope.marketplaceAccountId),
    fetchSalesInRange(salesScope, client),
    getMarketplaceAccountForSync(scope.marketplaceAccountId),
  ]);

  const stockByProduct = aggregateStockByProduct(inventoryRows);
  const purchasesByProduct = countPurchasesByProduct(sales);
  const purchasesByProductAndSize = countPurchasesByProductAndSize(sales);

  const rowsByProduct = new Map<string, typeof inventoryRows>();
  for (const row of inventoryRows) {
    const list = rowsByProduct.get(row.productId) ?? [];
    list.push(row);
    rowsByProduct.set(row.productId, list);
  }

  const accountLastSync = account.last_successful_sync_at ?? account.last_sync_at ?? null;
  const models = [];
  const detailsByProductId: InventoryReport["detailsByProductId"] = {};

  for (const product of products) {
    const productId = String(product.id);
    const productRows = rowsByProduct.get(productId) ?? [];
    const stock = stockByProduct.get(productId) ?? {
      currentStock: 0,
      availableStock: 0,
      reservedStock: 0,
      lastSync: null,
    };

    const purchases30Day = purchasesByProduct.get(productId) ?? 0;

    if (stock.currentStock <= 0 && productRows.length === 0 && purchases30Day === 0) continue;

    models.push(buildModelRow(product, stock, purchases30Day));
    detailsByProductId[productId] = buildModelDetail(
      product,
      productRows,
      purchases30Day,
      purchasesByProductAndSize.get(productId) ?? new Map()
    );
  }

  return {
    models: sortModelsByUrgency(models),
    detailsByProductId,
    accountLastSync,
    accountSyncStatus: account.last_sync_status,
    marketplaceAccountId: scope.marketplaceAccountId,
  };
}

/** Sum current stock per product — used by Product Analytics link column. */
export async function getCurrentStockByProductId(
  marketplaceAccountId: string
): Promise<Map<string, number>> {
  const client = await createServerClient();
  const rows = await getInventoryForAccount(marketplaceAccountId, client);
  const stockByProduct = aggregateStockByProduct(rows);

  return new Map(
    [...stockByProduct.entries()].map(([productId, stock]) => [productId, stock.currentStock])
  );
}
