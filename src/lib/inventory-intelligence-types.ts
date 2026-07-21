import type { ScopedDateRange } from "@/types/database";

/**
 * Stock Health from days since last sale (dynamic — never persisted).
 * Defaults: 0–7 Healthy | 8–30 Slow | 31–60 At Risk | 60+ Dead Stock.
 */
export type StockHealthStatus = "Healthy" | "Slow" | "At Risk" | "Dead Stock";

export type StockHealthThresholds = {
  /** Inclusive upper bound for Healthy (default 7). */
  healthyMaxDays: number;
  /** Inclusive upper bound for Slow (default 30). */
  slowMaxDays: number;
  /** Inclusive upper bound for At Risk (default 60). Above → Dead Stock. */
  atRiskMaxDays: number;
};

export const DEFAULT_STOCK_HEALTH_THRESHOLDS: StockHealthThresholds = {
  healthyMaxDays: 7,
  slowMaxDays: 30,
  atRiskMaxDays: 60,
};

/**
 * Per-warehouse sales slice for one SKU.
 * Sales Share = warehouse Orders / total SKU Orders (same permanent Order Share rule
 * as Warehouse Sales Analytics — not units or revenue).
 */
export type WarehouseDistributionRow = {
  warehouse: string;
  orders: number;
  unitsSold: number;
  revenue: number;
  salesSharePercent: number;
};

export type InventoryIntelligenceSkuRow = {
  productId: string;
  /** products.supplier_article */
  sku: string;
  productName: string;
  /** products.nm_id — for UI thumbnails only (not used in aggregation). */
  nmId: number | null;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  /** Sum of wb_stock quantity_full (current) across warehouses/sizes. */
  currentStock: number;
  /**
   * Distinct warehouses with current stock rows for this SKU (wb_stock).
   * Not sales-period warehouses — see summarizeProductStock (Sprint 6.46.1).
   */
  warehouseCount: number;
  /** Warehouse distribution from completed sales in the report date range. */
  warehouseDistribution: WarehouseDistributionRow[];
  /** MAX(wb_sales.sale_date) for completed sales (all-time within account scope). */
  lastSaleDate: string | null;
  /** Calendar days from lastSaleDate to asOfDate; null when never sold. */
  daysSinceLastSale: number | null;
  stockHealth: StockHealthStatus;
};

export type InventoryIntelligenceReport = {
  range: ScopedDateRange;
  /** YYYY-MM-DD used for Days Since Last Sale / Stock Health. */
  asOfDate: string;
  thresholds: StockHealthThresholds;
  rows: InventoryIntelligenceSkuRow[];
  loadTimeMs: number;
  /** Completed sales rows used for warehouse distribution (scoped date range). */
  distributionSalesRowCount: number;
  /** Completed sales rows scanned for last-sale dates (no date lower bound). */
  lastSaleSalesRowCount: number;
};
