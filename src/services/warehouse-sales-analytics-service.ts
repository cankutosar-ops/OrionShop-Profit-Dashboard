import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { recordPerfEvent } from "@/lib/perf/perf-recorder";
import { logScopeAudit } from "@/lib/scope-audit-log";
import {
  aggregateWarehouseProductSales,
  aggregateWarehouseSales,
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

export type WarehouseSalesAnalyticsReport = {
  range: ScopedDateRange;
  rows: WarehouseSalesRow[];
  totals: WarehouseSalesTotals;
  /** Product breakdown when a warehouse was requested; otherwise null. */
  drillDownWarehouse: string | null;
  products: WarehouseProductSalesRow[] | null;
  loadTimeMs: number;
  /** Rows fetched from wb_sales after SQL filters (completed + non-null warehouse). */
  sourceRowCount: number;
};

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? createServerClient();
}

/**
 * Fetch completed sales with non-null warehouse for the scope.
 * Filters pushed to SQL: marketplace_account_id, sale_date range, is_return=false, warehouse NOT NULL.
 * Optional brand scope via product_id IN (...).
 * Aggregation stays in application code (no DB RPC / schema change).
 */
async function fetchCompletedSalesWithWarehouse(
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
      .not("warehouse", "is", null)
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
  const client = getClient(options?.client);

  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
    columns: "id, supplier_article, name, brand_id, nm_id",
  });

  const productIds = scope.brandId ? products.map((p) => String(p.id)) : undefined;
  const sales = await fetchCompletedSalesWithWarehouse(scope, client, productIds);

  const { rows, totals } = aggregateWarehouseSales(sales);

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
    orders: 0,
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
    sourceRowCount: sales.length,
  };
}
