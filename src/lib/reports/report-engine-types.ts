import type { ScopedDateRange } from "@/types/database";

export type ReportTemplateId = string;
export type ReportTemplateVersion = number;
export type ReportTemplateStatus = "draft" | "active" | "deprecated";

export type ReportPeriodPreset =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "last_6_months"
  | "yearly"
  | "custom";

export type ReportRequest = {
  templateId: ReportTemplateId;
  templateVersion?: ReportTemplateVersion;
  scope: ScopedDateRange;
  periodPreset?: ReportPeriodPreset;
  options?: Record<string, unknown>;
  dataMode?: "live" | "snapshot";
  locale?: "en" | "ru" | "tr";
};

export type ReportSection<T = unknown> = {
  id: string;
  titleKey: string;
  data: T;
};

/** Standard identity + freshness metadata — blueprint §15. Not a worksheet. */
export type ReportIdentity = {
  reportName: string;
  company: string;
  marketplace: string;
  account: string;
  reportingPeriod: { from: string; to: string; presetLabel?: string };
  currency: string;
  generatedAt: string;
  templateVersion: ReportTemplateVersion;
  lastSuccessfulSyncAt: string | null;
};

export type ReportPayload = {
  templateId: ReportTemplateId;
  templateVersion: ReportTemplateVersion;
  generatedAt: string;
  scope: ScopedDateRange;
  periodPreset?: ReportPeriodPreset;
  locale: string;
  snapshotId: string | null;
  identity: ReportIdentity;
  sections: ReportSection[];
  meta?: { warnings?: string[]; rowCounts?: Record<string, number> };
};

export type ReportNoDataResult = {
  ok: false;
  code: "NO_DATA_FOR_PERIOD";
  messageKey: string;
  message: string;
  scope: ScopedDateRange;
};

export type ReportRunSuccess = {
  ok: true;
  payload: ReportPayload;
};

export type ReportRunResult = ReportRunSuccess | ReportNoDataResult;

export type ExportFormat = "xlsx" | "csv" | "json" | "pdf";

export type ExportAdapter = {
  format: ExportFormat;
  render(payload: ReportPayload): Promise<ArrayBuffer | string>;
};

export type ReportExportSuccess = {
  ok: true;
  format: ExportFormat;
  filename: string;
  body: ArrayBuffer | string;
  payload: ReportPayload;
};

export type ReportExportResult = ReportExportSuccess | ReportNoDataResult;

/** @deprecated Sprint 7.1 thin KPI shape — kept for emptiness helper compatibility. */
export type BusinessReportKpiData = {
  revenue: number;
  profit: number;
  orders: number;
  purchases: number;
};

export type BusinessExecutiveSummaryData = {
  revenue: number;
  netProfit: number;
  orders: number;
  purchases: number;
  conversionRate: number;
  returnRate: number;
  marketplaceCosts: number;
  unitsSold: number;
  unitsReturned: number;
  /** Purchases amount ÷ purchases count from existing OrdersPurchases KPIs (display only). */
  averageSellingPrice: number | null;
  /** Rule-based factual observations — presentation only. */
  insights: string[];
};

export type BusinessFinancialSummaryData = {
  revenue: number;
  productCost: number;
  marketplaceFees: number;
  commission: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  penalties: number;
  otherExpenses: number;
  netProfit: number;
  wbSettlement: {
    available: boolean;
    netForPay: number;
    logistics: number;
    storage: number;
    penalties: number;
    deductions: number;
    acceptance: number;
    settlement: number;
    dataSource: string;
  };
};

export type BusinessProductRankRow = {
  rank: number;
  sku: string;
  productName: string;
  value: number;
};

export type BusinessProductHighlight = {
  label: string;
  sku: string;
  productName: string;
  valueLabel: string;
};

export type BusinessProductSummaryData = {
  highlights: BusinessProductHighlight[];
  topRevenue: BusinessProductRankRow[];
  topProfit: BusinessProductRankRow[];
  bestConversion: BusinessProductRankRow[];
  mostReturned: BusinessProductRankRow[];
  mostSold: BusinessProductRankRow[];
  bestSellingBrand: { name: string; revenue: number } | null;
};

export type BusinessInventoryStockRow = {
  sku: string;
  productName: string;
  currentStock: number;
  daysLeft: number | null;
  status: string;
};

export type BusinessWarehouseRow = {
  warehouse: string;
  orders: number;
  units: number;
  revenue: number;
  orderSharePercent: number;
  revenueSharePercent: number;
};

export type BusinessInventoryHealth = {
  healthy: number;
  lowStock: number;
  outOfStock: number;
  warehouseCoverage: number;
};

export type BusinessInventorySummaryData = {
  health: BusinessInventoryHealth;
  stockRows: BusinessInventoryStockRow[];
  warehouseDistribution: BusinessWarehouseRow[];
  notes: string[];
};

/** ── Product Report (Sprint 7.3) ───────────────────────────────────── */

export type ProductReportRankRow = {
  rank: number;
  sku: string;
  productName: string;
  brandName: string;
  categoryName: string;
  value: number;
};

export type ProductReportPerformanceRow = {
  productId: string;
  sku: string;
  productName: string;
  brandName: string;
  categoryName: string;
  revenue: number;
  profit: number;
  marginPercent: number;
  orders: number;
  purchases: number;
  conversionPercent: number;
  unitsSold: number;
  inventory: number;
  marketplaceFees: number;
  advertising: number;
  status: string;
};

export type ProductReportCostRow = {
  sku: string;
  productName: string;
  commission: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  otherMarketplaceCosts: number;
  totalMarketplaceCost: number;
};

export type ProductReportPortfolioGroup = {
  name: string;
  productCount: number;
  revenue: number;
  profit: number;
  revenueSharePercent: number;
  profitSharePercent: number;
};

export type ProductReportExecutiveData = {
  totalProducts: number;
  activeProducts: number;
  productsWithSales: number;
  topRevenueProduct: ProductReportRankRow | null;
  topProfitProduct: ProductReportRankRow | null;
  highestMarginProduct: ProductReportRankRow | null;
  highestConversionProduct: ProductReportRankRow | null;
  highestReturnProduct: ProductReportRankRow | null;
  lowestPerformingProduct: ProductReportRankRow | null;
  averageMarginPercent: number | null;
  averageSellingPrice: number | null;
  /** Sum of current stock units from inventory report (not a monetary valuation). */
  inventoryUnits: number | null;
  /**
   * Monetary inventory value is not exposed by current dashboard services —
   * always null; shown as "—" in the workbook.
   */
  inventoryValue: number | null;
  insights: string[];
};

export type ProductReportPerformanceData = {
  rows: ProductReportPerformanceRow[];
};

export type ProductReportProfitabilityData = {
  topProfit: ProductReportRankRow[];
  bottomProfit: ProductReportRankRow[];
  highestMargin: ProductReportRankRow[];
  lowestMargin: ProductReportRankRow[];
  negativeProfit: ProductReportRankRow[];
};

export type ProductReportMarketplaceCostData = {
  rows: ProductReportCostRow[];
  totals: {
    commission: number;
    logistics: number;
    returnLogistics: number;
    storage: number;
    advertising: number;
    otherMarketplaceCosts: number;
    totalMarketplaceCost: number;
  };
};

export type ProductReportInventoryData = {
  health: {
    healthy: number;
    lowStock: number;
    outOfStock: number;
    /** Intelligence "At Risk" count when available — closest existing critical signal. */
    atRisk: number | null;
  };
  stockRows: BusinessInventoryStockRow[];
  warehouseDistribution: BusinessWarehouseRow[];
  notes: string[];
};

export type ProductReportPortfolioData = {
  byBrand: ProductReportPortfolioGroup[];
  byCategory: ProductReportPortfolioGroup[];
  byStatus: ProductReportPortfolioGroup[];
  largestBrand: ProductReportPortfolioGroup | null;
  largestCategory: ProductReportPortfolioGroup | null;
  highestRevenueCategory: ProductReportPortfolioGroup | null;
  highestProfitCategory: ProductReportPortfolioGroup | null;
};

export type ProductReportAppendixData = {
  rows: ProductReportPerformanceRow[];
  costRows: ProductReportCostRow[];
};
