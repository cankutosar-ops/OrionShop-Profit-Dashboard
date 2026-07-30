import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { logScopeAudit } from "@/lib/scope-audit-log";
import {
  aggregateWarehouseProductSales,
  aggregateWarehouseSales,
  type WarehouseOrderInput,
  type WarehouseProductSalesRow,
  type WarehouseSaleInput,
  type WarehouseSalesRow,
  type WarehouseSalesTotals,
} from "@/lib/warehouse-sales-analytics";
import { fetchProductsWithRelations } from "@/services/persisted-query-service";
import type { ScopedDateRange } from "@/types/database";

const PAGE_SIZE = 1000;

const SALE_COLUMNS =
  "warehouse, quantity, price_with_disc, is_return, product_id, nm_id";

const ORDER_COLUMNS = "warehouse, product_id, quantity, price_with_disc, price";

export type WarehouseSalesAnalyticsReport = {
  range: ScopedDateRange;
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
  /** Product breakdown when a warehouse was requested; otherwise null. */
  drillDownWarehouse: string | null;
  products: WarehouseProductSalesRow[] | null;
  loadTimeMs: number;
  /** Completed wb_sales rows in scope (units/revenue source). */
  sourceSaleCount: number;
  /** wb_orders rows in scope (orders source). */
  sourceOrderCount: number;
  /** @deprecated Use sourceSaleCount — kept for callers expecting sale row count. */
  sourceRowCount: number;
};

async function getClient(client?: SupabaseClient): Promise<SupabaseClient> {
  return client ?? (await createServerClient());
}

/**
 * Fetch all marketplace orders for the scope (Orders KPI).
 * Includes NULL warehouse rows (aggregated as Unknown Warehouse).
 */
async function fetchOrdersForWarehouseAnalytics(
  scope: ScopedDateRange,
  client: SupabaseClient,
  productIds?: string[]
): Promise<WarehouseOrderInput[]> {
  if (productIds && productIds.length === 0) return [];

  const started = Date.now();
  const rows: WarehouseOrderInput[] = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let query = client
      .from("wb_orders")
      .select(ORDER_COLUMNS)
      .eq("marketplace_account_id", scope.marketplaceAccountId)
      .gte("order_date", scope.from)
      .lte("order_date", scope.to)
      .order("order_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (productIds) {
      query = query.in("product_id", productIds);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch wb_orders for warehouse analytics: ${error.message}`);
    }

    const page = (data ?? []) as WarehouseOrderInput[];
    rows.push(...page);
    pages += 1;

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  recordPerfEvent({
    category: "sql",
    name: "sql.wb_orders.warehouse_sales_analytics",
    durationMs: Date.now() - started,
    meta: {
      table: "wb_orders",
      rows: rows.length,
      pages,
      queryName: "wb_orders.warehouse_sales_analytics",
      from: scope.from,
      to: scope.to,
    },
  });

  return rows;
}

/**
 * Fetch completed sales for Units / Revenue.
 * NULL warehouses are included (aggregated as Unknown Warehouse).
 */
async function fetchCompletedSalesForWarehouseAnalytics(
  scope: ScopedDateRange,
  client: SupabaseClient,
  productIds?: string[]
): Promise<WarehouseSaleInput[]> {
  if (productIds && productIds.length === 0) return [];

  const started = Date.now();
  const rows: WarehouseSaleInput[] = [];
  let offset = 0;
  let pages = 0;

  while (true) {
    let query = client
      .from("wb_sales")
      .select(SALE_COLUMNS)
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
      throw new Error(`Failed to fetch wb_sales for warehouse analytics: ${error.message}`);
    }

    const page = (data ?? []) as WarehouseSaleInput[];
    rows.push(...page);
    pages += 1;

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  recordPerfEvent({
    category: "sql",
    name: "sql.wb_sales.warehouse_sales_analytics",
    durationMs: Date.now() - started,
    meta: {
      table: "wb_sales",
      rows: rows.length,
      pages,
      queryName: "wb_sales.warehouse_sales_analytics",
      from: scope.from,
      to: scope.to,
    },
  });

  return rows;
}

export async function getWarehouseSalesAnalytics(
  scope: ScopedDateRange,
  options?: { warehouse?: string | null; client?: SupabaseClient }
): Promise<WarehouseSalesAnalyticsReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const started = Date.now();
  const client = await getClient(options?.client);

  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
    columns: "id, supplier_article, name, brand_id, nm_id",
  });

  const productIds = scope.brandId ? products.map((p) => String(p.id)) : undefined;
  const [orders, sales] = await Promise.all([
    fetchOrdersForWarehouseAnalytics(scope, client, productIds),
    fetchCompletedSalesForWarehouseAnalytics(scope, client, productIds),
  ]);

  const { rows, totals } = aggregateWarehouseSales({ orders, sales });

  const productLookup = new Map(
    products.map((p) => [
      String(p.id),
      { sku: p.supplier_article, productName: p.name },
    ])
  );

  const drillDownWarehouse = options?.warehouse?.trim() || null;
  let productRows: WarehouseProductSalesRow[] | null = null;
  if (drillDownWarehouse) {
    productRows = aggregateWarehouseProductSales(sales, drillDownWarehouse, productLookup);
  }

  logScopeAudit("Warehouse Sales Analytics", scope, scope, {
    orders: orders.length,
    sales: sales.length,
    finance: 0,
  });

  return {
    range: scope,
    rows,
    totals,
    drillDownWarehouse,
    products: productRows,
    loadTimeMs: Date.now() - started,
    sourceSaleCount: sales.length,
    sourceOrderCount: orders.length,
    sourceRowCount: sales.length,
  };
}
