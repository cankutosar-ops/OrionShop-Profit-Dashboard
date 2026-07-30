import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { logScopeAudit } from "@/lib/scope-audit-log";
import {
  buildInventoryIntelligenceRows,
  groupSalesByProduct,
  maxSaleDateByProduct,
  type IntelligenceProductInput,
  type IntelligenceSaleInput,
} from "@/lib/inventory-intelligence-aggregation";
import {
  DEFAULT_STOCK_HEALTH_THRESHOLDS,
  type InventoryIntelligenceReport,
  type StockHealthThresholds,
} from "@/lib/inventory-intelligence-types";
import type { InventoryStockRow } from "@/lib/inventory-types";
import { fetchProductsWithRelations } from "@/services/persisted-query-service";
import { getInventoryForAccount } from "@/services/inventory-service";
import type { ScopedDateRange } from "@/types/database";

const PAGE_SIZE = 1000;

const DISTRIBUTION_SALE_COLUMNS =
  "warehouse, quantity, price_with_disc, is_return, product_id, sale_date";

const LAST_SALE_COLUMNS = "product_id, sale_date, is_return";

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

function todayYmd(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Completed sales in the scoped date range for warehouse distribution.
 * Filters: marketplace_account_id, sale_date range, is_return=false.
 * Optional brand via product_id IN (...).
 */
async function fetchDistributionSales(
  scope: ScopedDateRange,
  client: SupabaseClient,
  productIds?: string[]
): Promise<IntelligenceSaleInput[]> {
  if (productIds && productIds.length === 0) return [];

  const started = Date.now();
  const rows: IntelligenceSaleInput[] = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let query = client
      .from("wb_sales")
      .select(DISTRIBUTION_SALE_COLUMNS)
      .eq("marketplace_account_id", scope.marketplaceAccountId)
      .gte("sale_date", scope.from)
      .lte("sale_date", scope.to)
      .eq("is_return", false)
      .order("sale_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (productIds) {
      query = query.in("product_id", productIds);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `Failed to fetch wb_sales for inventory intelligence distribution: ${error.message}`
      );
    }

    const page = (data ?? []) as IntelligenceSaleInput[];
    rows.push(...page);
    pages += 1;

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  recordPerfEvent({
    category: "sql",
    name: "sql.wb_sales.inventory_intelligence_distribution",
    durationMs: Date.now() - started,
    meta: {
      table: "wb_sales",
      rows: rows.length,
      pages,
      queryName: "wb_sales.inventory_intelligence_distribution",
      from: scope.from,
      to: scope.to,
    },
  });

  return rows;
}

/**
 * Completed sales for Last Sale Date (MAX(sale_date)) — no date lower bound.
 * Lightweight columns only; still account- and brand-scoped.
 */
async function fetchLastSaleCandidates(
  marketplaceAccountId: string,
  client: SupabaseClient,
  productIds?: string[]
): Promise<IntelligenceSaleInput[]> {
  if (productIds && productIds.length === 0) return [];

  const started = Date.now();
  const rows: IntelligenceSaleInput[] = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let query = client
      .from("wb_sales")
      .select(LAST_SALE_COLUMNS)
      .eq("marketplace_account_id", marketplaceAccountId)
      .eq("is_return", false)
      .order("sale_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (productIds) {
      query = query.in("product_id", productIds);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(
        `Failed to fetch wb_sales for inventory intelligence last sale: ${error.message}`
      );
    }

    const page = (data ?? []) as IntelligenceSaleInput[];
    rows.push(...page);
    pages += 1;

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  recordPerfEvent({
    category: "sql",
    name: "sql.wb_sales.inventory_intelligence_last_sale",
    durationMs: Date.now() - started,
    meta: {
      table: "wb_sales",
      rows: rows.length,
      pages,
      queryName: "wb_sales.inventory_intelligence_last_sale",
    },
  });

  return rows;
}

function toProductInputs(
  products: Awaited<ReturnType<typeof fetchProductsWithRelations>>
): IntelligenceProductInput[] {
  return products.map((p) => ({
    productId: String(p.id),
    sku: p.supplier_article,
    productName: p.name,
    nmId: p.nm_id != null && Number.isFinite(Number(p.nm_id)) ? Number(p.nm_id) : null,
    brandId: p.brand_id ? String(p.brand_id) : "",
    brandName: p.brand?.name ?? "",
    categoryId: p.category_id ? String(p.category_id) : "",
    categoryName: p.category?.name ?? "",
  }));
}

function groupStockByProduct(rows: InventoryStockRow[]): Map<string, InventoryStockRow[]> {
  const map = new Map<string, InventoryStockRow[]>();
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push(row);
    map.set(row.productId, list);
  }
  return map;
}

/**
 * Reusable Inventory Intelligence aggregation for Intelligence page, Product Detail,
 * Dashboard widgets, and reports. No new tables / snapshots — live from wb_sales + wb_stock.
 *
 * Scope: marketplace_account_id + optional brandId (warehouse-sales pattern).
 * Date range on scope drives warehouse distribution only; Last Sale Date is all-time MAX(sale_date).
 */
export async function getInventoryIntelligence(
  scope: ScopedDateRange,
  options?: {
    client?: SupabaseClient;
    thresholds?: StockHealthThresholds;
    /** YYYY-MM-DD for Days Since Last Sale (default: today UTC). */
    asOfDate?: string;
  }
): Promise<InventoryIntelligenceReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const started = Date.now();
  const client = await getClient(options?.client);
  const thresholds = options?.thresholds ?? DEFAULT_STOCK_HEALTH_THRESHOLDS;
  const asOfDate = options?.asOfDate ?? todayYmd();

  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
    columns:
      "id, supplier_article, name, nm_id, brand_id, category_id, brand:brands(*), category:categories(*)",
  });

  const productIds = scope.brandId ? products.map((p) => String(p.id)) : undefined;

  const [inventoryRows, distributionSales, lastSaleSales] = await Promise.all([
    getInventoryForAccount(scope.marketplaceAccountId, client),
    fetchDistributionSales(scope, client, productIds),
    fetchLastSaleCandidates(scope.marketplaceAccountId, client, productIds),
  ]);

  // Brand scope: inventory service returns all account stock — filter to scoped products.
  const productIdSet = new Set(products.map((p) => String(p.id)));
  const scopedStock = scope.brandId
    ? inventoryRows.filter((row) => productIdSet.has(row.productId))
    : inventoryRows;

  const rows = buildInventoryIntelligenceRows({
    products: toProductInputs(products),
    stockByProduct: groupStockByProduct(scopedStock),
    salesByProduct: groupSalesByProduct(distributionSales),
    lastSaleByProduct: maxSaleDateByProduct(lastSaleSales),
    asOfDate,
    thresholds,
  });

  logScopeAudit("Inventory Intelligence", scope, scope, {
    orders: 0,
    sales: distributionSales.length,
    finance: 0,
  });

  return {
    range: scope,
    asOfDate,
    thresholds,
    rows,
    loadTimeMs: Date.now() - started,
    distributionSalesRowCount: distributionSales.length,
    lastSaleSalesRowCount: lastSaleSales.length,
  };
}

/**
 * Single-SKU Intelligence row for Product Detail / widgets.
 * Returns null when Supabase is not configured; returns undefined-equivalent empty when SKU missing.
 */
export async function getInventoryIntelligenceForProduct(
  scope: ScopedDateRange,
  productId: string,
  options?: {
    client?: SupabaseClient;
    thresholds?: StockHealthThresholds;
    asOfDate?: string;
  }
): Promise<InventoryIntelligenceReport | null> {
  const report = await getInventoryIntelligence(scope, options);
  if (!report) return null;

  const id = String(productId);
  return {
    ...report,
    rows: report.rows.filter((row) => row.productId === id),
  };
}
