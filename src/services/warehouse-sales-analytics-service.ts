import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { logScopeAudit } from "@/lib/scope-audit-log";
import {
  aggregateWarehouseProductSales,
  aggregateWarehouseProductReport,
  type WarehouseProductReportRow,
  aggregateWarehouseSales,
  warehousePeriodEndExclusive,
  type WarehouseOrderInput,
  type WarehouseProductSalesRow,
  type WarehouseSaleInput,
  type WarehouseSalesRow,
  type WarehouseSalesTotals,
} from "@/lib/warehouse-sales-analytics";
import type { WarehouseLocation } from "@/lib/warehouse-locations";
import { buildWarehouseLocations, mergeWarehouseNameLists } from "@/lib/warehouse-locations";
import { fetchProductsWithRelations } from "@/services/persisted-query-service";
import { listWarehouseLocations } from "@/services/warehouse-location-service";
import { readSellerWarehouses } from "@/services/wb-seller-warehouse-service";
import { readFbsOrderEvidence } from "@/services/wb-fbs-evidence-service";
import { attributeFbsWarehouses } from "@/lib/fbs-warehouse-attribution";
import type { ScopedDateRange } from "@/types/database";

const PAGE_SIZE = 1000;

const SALE_COLUMNS =
  "srid, warehouse, quantity, price_with_disc, is_return, product_id, nm_id";

const ORDER_COLUMNS = "srid, warehouse, product_id, nm_id, quantity, price_with_disc, price";

export type WarehouseSalesAnalyticsReport = {
  range: ScopedDateRange;
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
  /** Product breakdown when a warehouse was requested; otherwise null. */
  drillDownWarehouse: string | null;
  products: WarehouseProductSalesRow[] | null;
  warehouseProducts?: WarehouseProductReportRow[];
  fbsAttribution: { available: boolean; evidenceRows: number; attributedOrders: number; attributedSales: number };
  /** Account Warehouse Locations (WB + FBS peers) — name is the filter key. */
  locations: WarehouseLocation[];
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
      .lt("order_date", warehousePeriodEndExclusive(scope.to))
      .order("order_date", { ascending: true })
      .order("id", { ascending: true })
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
      .lt("sale_date", warehousePeriodEndExclusive(scope.to))
      .eq("is_return", false)
      .order("sale_date", { ascending: true })
      .order("id", { ascending: true })
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
  options?: { warehouse?: string | null; client?: SupabaseClient; includeAllProducts?: boolean }
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
  const [sourceOrders, sourceSales, catalogLocations, sellerWarehouses, evidence] = await Promise.all([
    fetchOrdersForWarehouseAnalytics(scope, client, productIds),
    fetchCompletedSalesForWarehouseAnalytics(scope, client, productIds),
    listWarehouseLocations(scope.marketplaceAccountId, {
      activeOnly: true,
      client,
    }).catch(() => [] as WarehouseLocation[]),
    readSellerWarehouses(scope.marketplaceAccountId, client),
    readFbsOrderEvidence(scope.marketplaceAccountId, client),
  ]);

  // Read projection only. Account-scoped RID + nm_id proof; stored business history is untouched.
  const orderAttribution = attributeFbsWarehouses(sourceOrders, evidence.rows, sellerWarehouses);
  const saleAttribution = attributeFbsWarehouses(sourceSales, evidence.rows, sellerWarehouses);
  const orders = orderAttribution.rows, sales = saleAttribution.rows;

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
    productRows = aggregateWarehouseProductSales({ orders, sales }, drillDownWarehouse, productLookup);
  }

  const periodNames = mergeWarehouseNameLists(
    rows.map((r) => r.warehouse),
    catalogLocations.map((l) => l.name)
  );
  const locations = buildWarehouseLocations(
    periodNames.map((name) => ({ name, active: true }))
  ).map(location => catalogLocations.find(row => row.name === location.name) ?? location);

  logScopeAudit("Warehouse Sales Analytics", scope, scope, {
    orders: orders.length,
    sales: sales.length,
    finance: 0,
  });

  return {
    range: scope,
    fbsAttribution: { available: evidence.available, evidenceRows: evidence.rows.length,
      attributedOrders: orderAttribution.attributed, attributedSales: saleAttribution.attributed },
    rows,
    totals,
    drillDownWarehouse,
    products: productRows,
    ...(options?.includeAllProducts ? { warehouseProducts: aggregateWarehouseProductReport(sales, productLookup) } : {}),
    locations,
    loadTimeMs: Date.now() - started,
    sourceSaleCount: sales.length,
    sourceOrderCount: orders.length,
    sourceRowCount: sales.length,
  };
}
