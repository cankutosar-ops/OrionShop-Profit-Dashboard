/**
 * Inventory Intelligence — pure SKU aggregation.
 * Stock Health and warehouse Sales Share are computed here (never stored).
 * Sales Share uses Orders (row count), matching Warehouse Sales Analytics Order Share.
 */

import {
  isCompletedWarehouseSale,
  normalizeWarehouseKey,
  salePriceWithDiscAmount,
  type WarehouseSaleInput,
} from "@/lib/warehouse-sales-analytics";
import type { InventoryStockRow } from "@/lib/inventory-types";
import {
  DEFAULT_STOCK_HEALTH_THRESHOLDS,
  type InventoryIntelligenceSkuRow,
  type StockHealthStatus,
  type StockHealthThresholds,
  type WarehouseDistributionRow,
} from "@/lib/inventory-intelligence-types";

export type IntelligenceSaleInput = WarehouseSaleInput & {
  sale_date?: string | null;
};

export type IntelligenceProductInput = {
  productId: string;
  sku: string;
  productName: string;
  nmId: number | null;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
};

type WarehouseAcc = { orders: number; unitsSold: number; revenue: number };

function emptyWarehouseAcc(): WarehouseAcc {
  return { orders: 0, unitsSold: 0, revenue: 0 };
}

/**
 * Normalize DB/API date to YYYY-MM-DD.
 * wb_sales.sale_date may arrive as `2026-07-20` or `2026-07-20T00:00:00+00:00`.
 */
export function toYmd(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

/** Parse YYYY-MM-DD as UTC midnight for stable calendar-day math. */
export function parseYmdUtc(ymd: string): Date {
  const normalized = toYmd(ymd);
  if (!normalized) return new Date(Number.NaN);
  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Calendar days between two date strings (to − from). Accepts YYYY-MM-DD or ISO. */
export function calendarDaysBetween(fromYmd: string, toYmd: string): number {
  const from = parseYmdUtc(fromYmd);
  const to = parseYmdUtc(toYmd);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return Number.NaN;
  }
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Classify Stock Health from days since last sale.
 * Never sold (null days) → Dead Stock (no activity signal).
 */
export function classifyStockHealth(
  daysSinceLastSale: number | null,
  thresholds: StockHealthThresholds = DEFAULT_STOCK_HEALTH_THRESHOLDS
): StockHealthStatus {
  if (daysSinceLastSale == null || daysSinceLastSale > thresholds.atRiskMaxDays) {
    return "Dead Stock";
  }
  if (daysSinceLastSale <= thresholds.healthyMaxDays) return "Healthy";
  if (daysSinceLastSale <= thresholds.slowMaxDays) return "Slow";
  return "At Risk";
}

/** Sum current stock and count distinct warehouses for one product's stock rows. */
export function summarizeProductStock(rows: InventoryStockRow[]): {
  currentStock: number;
  warehouseCount: number;
} {
  let currentStock = 0;
  const warehouses = new Set<string>();

  for (const row of rows) {
    currentStock += row.currentStock;
    const wh = row.warehouse?.trim();
    if (wh) warehouses.add(wh);
  }

  return { currentStock, warehouseCount: warehouses.size };
}

/**
 * Per-SKU warehouse distribution from completed sales.
 * Ignores NULL warehouses. Sales Share = orders / total SKU orders.
 * Sorted by revenue DESC (same as Warehouse Sales Analytics).
 */
export function aggregateSkuWarehouseDistribution(
  sales: IntelligenceSaleInput[]
): WarehouseDistributionRow[] {
  const byWarehouse = new Map<string, WarehouseAcc>();

  for (const sale of sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const key = normalizeWarehouseKey(sale.warehouse);
    if (key == null) continue;

    let acc = byWarehouse.get(key);
    if (!acc) {
      acc = emptyWarehouseAcc();
      byWarehouse.set(key, acc);
    }
    acc.orders += 1;
    acc.unitsSold += Number(sale.quantity) || 0;
    acc.revenue += salePriceWithDiscAmount(sale);
  }

  let totalOrders = 0;
  for (const acc of byWarehouse.values()) totalOrders += acc.orders;

  const rows: WarehouseDistributionRow[] = [...byWarehouse.entries()].map(
    ([warehouse, acc]) => ({
      warehouse,
      orders: acc.orders,
      unitsSold: acc.unitsSold,
      revenue: acc.revenue,
      salesSharePercent: totalOrders > 0 ? (acc.orders / totalOrders) * 100 : 0,
    })
  );

  rows.sort((a, b) => b.revenue - a.revenue || a.warehouse.localeCompare(b.warehouse));
  return rows;
}

/** MAX(sale_date) per product_id from completed sales (stored as YYYY-MM-DD). */
export function maxSaleDateByProduct(
  sales: Array<Pick<IntelligenceSaleInput, "is_return" | "product_id" | "sale_date">>
): Map<string, string> {
  const map = new Map<string, string>();

  for (const sale of sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const productId = sale.product_id ? String(sale.product_id) : "";
    const saleDate = toYmd(sale.sale_date);
    if (!productId || !saleDate) continue;

    const prev = map.get(productId);
    if (!prev || saleDate > prev) {
      map.set(productId, saleDate);
    }
  }

  return map;
}

/** Group completed sales by product_id (for warehouse distribution). */
export function groupSalesByProduct(
  sales: IntelligenceSaleInput[]
): Map<string, IntelligenceSaleInput[]> {
  const map = new Map<string, IntelligenceSaleInput[]>();

  for (const sale of sales) {
    if (!isCompletedWarehouseSale(sale)) continue;
    const productId = sale.product_id ? String(sale.product_id) : "";
    if (!productId) continue;
    const list = map.get(productId) ?? [];
    list.push(sale);
    map.set(productId, list);
  }

  return map;
}

export type BuildIntelligenceRowsInput = {
  products: IntelligenceProductInput[];
  stockByProduct: Map<string, InventoryStockRow[]>;
  salesByProduct: Map<string, IntelligenceSaleInput[]>;
  lastSaleByProduct: Map<string, string>;
  asOfDate: string;
  thresholds?: StockHealthThresholds;
};

/**
 * Build one Intelligence row per product that has stock, distribution sales, or a last sale.
 * Default sort: Dead Stock / At Risk first (days since last sale DESC), then SKU.
 */
export function buildInventoryIntelligenceRows(
  input: BuildIntelligenceRowsInput
): InventoryIntelligenceSkuRow[] {
  const thresholds = input.thresholds ?? DEFAULT_STOCK_HEALTH_THRESHOLDS;
  const rows: InventoryIntelligenceSkuRow[] = [];

  for (const product of input.products) {
    const stockRows = input.stockByProduct.get(product.productId) ?? [];
    const { currentStock, warehouseCount } = summarizeProductStock(stockRows);
    const distributionSales = input.salesByProduct.get(product.productId) ?? [];
    const warehouseDistribution = aggregateSkuWarehouseDistribution(distributionSales);
    const lastSaleDate = toYmd(input.lastSaleByProduct.get(product.productId) ?? null);
    const asOf = toYmd(input.asOfDate) ?? input.asOfDate;
    const daysRaw = lastSaleDate != null ? calendarDaysBetween(lastSaleDate, asOf) : null;
    const daysSinceLastSale =
      daysRaw != null && Number.isFinite(daysRaw) ? daysRaw : null;
    const stockHealth = classifyStockHealth(daysSinceLastSale, thresholds);

    if (
      currentStock <= 0 &&
      warehouseDistribution.length === 0 &&
      lastSaleDate == null &&
      stockRows.length === 0
    ) {
      continue;
    }

    rows.push({
      productId: product.productId,
      sku: product.sku,
      productName: product.productName,
      nmId: product.nmId,
      brandId: product.brandId,
      brandName: product.brandName,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      currentStock,
      warehouseCount,
      warehouseDistribution,
      lastSaleDate,
      daysSinceLastSale,
      stockHealth,
    });
  }

  const healthRank: Record<StockHealthStatus, number> = {
    "Dead Stock": 0,
    "At Risk": 1,
    Slow: 2,
    Healthy: 3,
  };

  rows.sort((a, b) => {
    const hr = healthRank[a.stockHealth] - healthRank[b.stockHealth];
    if (hr !== 0) return hr;
    const da = a.daysSinceLastSale ?? Number.POSITIVE_INFINITY;
    const db = b.daysSinceLastSale ?? Number.POSITIVE_INFINITY;
    if (db !== da) return db - da;
    return a.sku.localeCompare(b.sku);
  });

  return rows;
}
