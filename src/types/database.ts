import type {
  FinanceCategory,
  FinanceNature,
  FinanceOperationType,
  MarketplaceFeesPresentation,
} from "@/types/finance";
import { FINANCE_CATEGORIES, FINANCE_OPERATION_TYPES } from "@/types/finance";

export type MarketplaceType = "wildberries" | "ozon" | "lamoda";

export const MARKETPLACE_TYPES: MarketplaceType[] = ["wildberries", "ozon", "lamoda"];

/** Platforms that can be connected today (others show Coming Soon). */
export const MARKETPLACE_CONNECTABLE: MarketplaceType[] = ["wildberries"];

export type SyncStatus = "idle" | "running" | "success" | "partial" | "failed" | "warning";

export const SYNC_STATUSES: SyncStatus[] = [
  "idle",
  "running",
  "success",
  "partial",
  "failed",
  "warning",
];

/** Durable new-account onboarding lifecycle (finance historical → incremental). */
export type SyncLifecycleStatus =
  | "NEW_ACCOUNT"
  | "ACCOUNT_VERIFICATION"
  | "HISTORICAL_BACKFILL_RUNNING"
  | "HISTORICAL_BACKFILL_VERIFYING"
  | "HISTORICAL_BACKFILL_COMPLETE"
  | "INCREMENTAL_SYNC_ACTIVE"
  | "HEALTHY"
  | "FAILED"
  | "PARTIAL"
  | "RECOVERING";

export const SYNC_LIFECYCLE_STATUSES: SyncLifecycleStatus[] = [
  "NEW_ACCOUNT",
  "ACCOUNT_VERIFICATION",
  "HISTORICAL_BACKFILL_RUNNING",
  "HISTORICAL_BACKFILL_VERIFYING",
  "HISTORICAL_BACKFILL_COMPLETE",
  "INCREMENTAL_SYNC_ACTIVE",
  "HEALTHY",
  "FAILED",
  "PARTIAL",
  "RECOVERING",
];

export type FinanceBackfillProgress = {
  completedWindows?: Record<string, boolean>;
  failedWindows?: Record<string, string>;
  pendingWindows?: string[];
  lastWindow?: string | null;
  strategy?: "monthly" | "rolling30" | "single";
  from?: string;
  to?: string;
};

export type SyncRunTrigger = "manual" | "auto" | "recover" | "backfill";

export type SyncRunStatus = "running" | "success" | "partial" | "failed" | "warning";

export type CommercialEntitySyncStatus =
  | "idle"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "blocked"
  | "rate_limited"
  | "permission_denied"
  | "external_unavailable"
  | "external_delay"
  | "warning";

export type CommercialEntitySyncStateRow = {
  marketplace_account_id: string;
  entity: "orders" | "sales" | "finance";
  last_execution_at: string | null;
  last_successful_execution_at: string | null;
  latest_data_date: string | null;
  status: CommercialEntitySyncStatus;
  failure_class: string | null;
  last_error: string | null;
  retry_count: number;
  next_retry_at: string | null;
  last_requested_from: string | null;
  last_requested_to: string | null;
  last_sync_run_id: string | null;
  rows_upserted_last: number;
  updated_at: string;
};

export type CommercialSyncTickRow = {
  id: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  accounts_considered: number;
  accounts_synced: number;
  accounts_skipped: number;
  accounts_failed: number;
  summary: Record<string, unknown>;
  error: string | null;
  created_at: string;
};

export type FinanceSyncReportStatus = "discovered" | "imported" | "missing" | "late";

export type SyncRun = {
  id: string;
  marketplace_account_id: string;
  request_id: string | null;
  trigger: SyncRunTrigger;
  entities: string[];
  status: SyncRunStatus;
  requested_from: string | null;
  requested_to: string | null;
  finance_lookback_days: number | null;
  returned_from: string | null;
  returned_to: string | null;
  report_ids: number[];
  rows_fetched: number;
  rows_upserted: number;
  rows_inserted: number;
  rows_updated: number;
  missing_days: string[];
  late_report_ids: number[];
  recovered_report_ids: number[];
  errors: unknown[];
  warnings: unknown[];
  started_at: string;
  heartbeat_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  gap_days: number | null;
  latest_operation_date: string | null;
  latest_report_id: number | null;
  created_at: string;
};

export type FinanceIncrementalSyncStateRow = {
  marketplace_account_id: string;
  mode: "idle" | "current_week" | "overlap_revalidation";
  week_status: "idle" | "in_progress" | "complete";
  active_week_from: string | null;
  active_week_to: string | null;
  last_persisted_rrd_id: number;
  overlap_revalidate_queue: unknown;
  completed_weeks: unknown;
  reports_last_request_at: string | null;
  reports_next_request_not_before: string | null;
  reports_server_retry_until: string | null;
  reports_last_rate_limit_snapshot: unknown;
  lock_owner: string | null;
  lock_heartbeat_at: string | null;
  lock_started_at: string | null;
  latest_successful_data_date: string | null;
  last_http_status: number | null;
  last_wake_at: string | null;
  last_error: string | null;
  last_cursor_before: number | null;
  last_cursor_after: number | null;
  last_rows_received: number | null;
  last_rows_persisted: number | null;
  last_has_more: boolean | null;
  updated_at: string;
};

export type FinanceSyncReportRow = {
  id: string;
  sync_run_id: string;
  marketplace_account_id: string;
  realizationreport_id: number;
  date_from: string | null;
  date_to: string | null;
  create_dt: string | null;
  status: FinanceSyncReportStatus;
  detail_rows_upserted: number;
  created_at: string;
};

export type CompanyStatus = "active" | "archived";

export type Company = {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  timezone: string;
  language: string;
  is_default: boolean;
  /** Soft archive — Sprint 11.2. Defaults to active when column absent. */
  status: CompanyStatus;
  /** Tax rate input (%) — not Estimated Tax. Defaults to 6 when column absent. */
  default_tax_percent: number;
  created_at: string;
  updated_at: string;
};

export type MarketplaceAccount = {
  id: string;
  company_id: string;
  marketplace: MarketplaceType;
  account_name: string;
  seller_id: string | null;
  api_key_encrypted: string;
  is_active: boolean;
  is_default: boolean;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_status: SyncStatus | null;
  finance_lookback_days?: number;
  finance_gap_warn_days?: number;
  sync_heartbeat_at?: string | null;
  sync_lock_expires_at?: string | null;
  finance_latest_operation_date?: string | null;
  finance_latest_report_id?: number | null;
  finance_gap_days?: number | null;
  finance_recovery_needed?: boolean;
  finance_last_sync_run_id?: string | null;
  sync_lifecycle_status?: SyncLifecycleStatus;
  finance_backfill_from?: string | null;
  finance_backfill_to?: string | null;
  finance_backfill_strategy?: string | null;
  finance_backfill_started_at?: string | null;
  finance_backfill_completed_at?: string | null;
  finance_backfill_verified_at?: string | null;
  finance_backfill_error?: string | null;
  finance_backfill_progress?: FinanceBackfillProgress;
  created_at: string;
  updated_at: string;
};

/** Safe for client UI — no encrypted key exposed. */
export type MarketplaceAccountPublic = {
  id: string;
  company_id: string;
  marketplace: MarketplaceType;
  account_name: string;
  seller_id: string | null;
  is_active: boolean;
  is_default: boolean;
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_status: SyncStatus | null;
  has_api_key: boolean;
  finance_lookback_days?: number;
  finance_gap_warn_days?: number;
  finance_latest_operation_date?: string | null;
  finance_latest_report_id?: number | null;
  finance_gap_days?: number | null;
  finance_recovery_needed?: boolean;
  sync_lifecycle_status?: SyncLifecycleStatus;
  finance_backfill_error?: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyWithAccounts = Company & {
  accounts: MarketplaceAccountPublic[];
};

export type Brand = {
  id: string;
  name: string;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  marketplace_account_id: string;
  supplier_article: string;
  nm_id: number;
  name: string;
  brand_id: string;
  category_id: string;
  barcode: string | null;
  created_at: string;
};

export type WbOrder = {
  id: string;
  marketplace_account_id: string;
  srid: string;
  nm_id: number;
  product_id: string;
  order_date: string;
  sale_date: string | null;
  /** List price (WB API totalPrice). */
  price: number;
  /** Seller-discounted price (WB API priceWithDisc) — Orders Value KPI. */
  price_with_disc: number;
  /** Last status change date (WB API lastChangeDate). */
  last_change_date: string | null;
  quantity: number;
  status: string;
  warehouse: string | null;
  tech_size: string | null;
  barcode: string | null;
};

export type WbSale = {
  id: string;
  marketplace_account_id: string;
  srid: string;
  nm_id: number;
  product_id: string;
  sale_date: string;
  revenue: number;
  /** Sales API priceWithDisc — commercial list price after seller discount. */
  price_with_disc?: number;
  /** Sales API forPay — goods settlement (netForPay building block). */
  for_pay?: number;
  quantity: number;
  is_return: boolean;
  return_date: string | null;
  /** Sales API warehouseName — fulfilling warehouse (same pattern as wb_orders.warehouse). */
  warehouse?: string | null;
  tech_size: string | null;
  barcode: string | null;
};

/** Profit Engine V4 — Commercial Performance. */
export type ModelBProfitMetrics = {
  grossSales: number;
  returnedSales: number;
  /** Sales = grossSales − returnedSales (priceWithDisc). */
  netSales: number;
  /** When not `ready`, dependent KPIs must not show temporary zero values. */
  netSalesStatus: import("@/lib/sales-revenue-resolution").NetSalesStatus;
  /**
   * Marketplace Fee = Sales − Sales API forPay (net).
   * Not from ppvz_sales_commission / ppvz_reward / ppvz_vw.
   */
  commission: number;
  /** Alias of commission — Marketplace Fee. */
  marketplaceFee?: number;
  /** Finance acquiring_fee (display; not deducted again in Net Profit). */
  acquiring: number;
  /** Revenue = Finance Σ ppvz_for_pay (signed for_pay lines). */
  revenue: number;
  logistics: number;
  storage: number;
  penalties: number;
  /** Other Marketplace Expenses (ADJUSTMENT category). */
  adjustments: number;
  /** Finance acceptance. */
  acceptance: number;
  productCost: number;
  advertising: number;
  /**
   * Operating Profit before tax =
   * Revenue − PC − Logistics − Storage − Acceptance − Penalties − Other − Ads.
   * Kept as `netProfit` for backward compatibility.
   */
  netProfit: number;
  /**
   * Seller Payout =
   * Revenue − Logistics − Storage − Acceptance − Penalties − Other.
   * Not the Estimated Tax base (tax uses Σ finishedPrice).
   */
  sellerPayout: number;
  /** Alias of netProfit — Operating Profit before tax. */
  operatingProfit: number;
  /** Tax rate % applied to Σ finishedPrice (customer paid). */
  taxPercent: number;
  /** Σ Sales API finishedPrice (net) — Estimated Tax base. */
  customerPaid: number;
  /**
   * Estimated Tax = Tax% × Σ finishedPrice (historical reporting).
   * Smart Pricing uses a different base — see docs/estimated-tax-models.md.
   */
  estimatedTax: number;
  /** After Tax Payout = Seller Payout − Estimated Tax. */
  afterTaxPayout: number;
  /**
   * Net Profit (V4) =
   * Revenue − PC − Logistics − Storage − Acceptance − Penalties − Other − Ads − Tax.
   * Does not subtract Marketplace Fee or Acquiring again.
   */
  finalNetProfit: number;
  /** @deprecated Legacy aggregate — not shown on Commercial Performance dashboard. */
  marketplaceFees?: number;
  /** @deprecated Use `adjustments`. */
  accountAdjustments?: number;
};

/** Profit Engine V3 — Model C (settlement layer). */
export type ModelCProfitMetrics = {
  /** Revenue = netForPay (goods settlement for the period). */
  revenue: number;
  /** Informational only — not deducted from net profit. */
  marketplaceFees: number;
  logistics: number;
  storage: number;
  penalties: number;
  deductions: number;
  acceptance: number;
  productCost: number;
  advertising: number;
  netProfit: number;
};

/** WB Settlement — Wildberries payment entitlement for the selected date range. */
export type WbSettlementDataSource = "finance_transaction" | "weekly_reports";

/** Informational availability for Model C / WB Settlement (not an application error). */
export type SettlementDataAvailability = {
  /** False when the selected period is after the latest realization report. */
  available: boolean;
  /** Latest weekly realization report period end (dateTo), when known. */
  latestRealizationReportDate: string | null;
  selectedFrom: string;
  selectedTo: string;
};

export type WbSettlementMetrics = {
  netForPay: number;
  logistics: number;
  storage: number;
  penalties: number;
  deductions: number;
  acceptance: number;
  settlement: number;
  dataSource: WbSettlementDataSource;
  dataSourceNote?: string;
  weeklyReportCount?: number;
  /** When unavailable, UI shows an informational notice instead of zero/partial figures. */
  availability?: SettlementDataAvailability;
};

/** Operational unit counts reused from profit breakdown. */
export type QuantityMetrics = {
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  /** Σ finishedPrice on returns — amount refunded to customers (display only). */
  returnedValue: number;
};

export type { FinanceCategory, FinanceNature, FinanceOperationType, MarketplaceFeesPresentation };
export { FINANCE_CATEGORIES, FINANCE_OPERATION_TYPES };

export type WbFinance = {
  id: string;
  marketplace_account_id: string;
  product_id: string | null;
  nm_id: number | null;
  operation_date: string;
  /** Permanent high-level profit bucket — always populated at sync. */
  operation_type: FinanceOperationType;
  amount: number;
  /** Wildberries line id: rrd:{rrd_id}:{suffix} — unique per report line. */
  source_key: string | null;
  description: string | null;
  /** Shipment/order id from WB reportDetailByPeriod — used for purchase logistics attribution. */
  srid: string | null;
  /** Normalized analytical category — set at sync/backfill only. */
  finance_category?: FinanceCategory | null;
  wb_source_suffix?: string | null;
  supplier_oper_name?: string | null;
  /** Reserved for a future FinanceNature dimension. */
  finance_nature?: string | null;
  /** WB realization report id — Finance Sync V2 discovery/health. */
  realizationreport_id?: number | null;
  /** WB rrd_id denormalized from source_key. */
  rrd_id?: number | null;
  /** WB rr_dt when distinct from operation_date. */
  rr_dt?: string | null;
};

export type WbAd = {
  id: string;
  product_id: string | null;
  supplier_article: string | null;
  nm_id: number | null;
  campaign_date: string;
  /** Rubles. Summed straight into the Financial Engine — never kopecks. */
  spend: number;
  clicks: number;
  impressions: number;
  /**
   * Added by 20260909090000. Primary tenancy guard for advertising: before it
   * existed, isolation depended entirely on product_id resolving to one of the
   * account's products.
   */
  marketplace_account_id?: string | null;
  /** WB advert campaign id (advertId). */
  campaign_id?: number | null;
  /** Idempotency key, `adv:{advertId}:{nmId}:{YYYY-MM-DD}`. */
  source_key?: string | null;
  updated_at?: string | null;
};

export type ProductCostHistory = {
  id: string;
  product_id: string;
  cost: number;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

/** Latest active cost per product for the Costs page. */
export type CostRecord = {
  id: string;
  product_id: string;
  supplier_article: string;
  product_name: string;
  cost: number;
  last_updated: string;
  effective_from: string;
};

export type ProductOption = {
  id: string;
  supplier_article: string;
  name: string;
};

/** One row in the Cost Management product table. */
export type CostManagementRow = {
  productId: string;
  supplierArticle: string;
  productName: string;
  currentStock: number;
  /** Period average sale price (revenue ÷ units sold), or null without sales. */
  currentSalePrice: number | null;
  currentPurchasePrice: number | null;
};

export type PurchaseCurrency = "USD" | "RUB" | "TRY" | "EUR";

export const PURCHASE_CURRENCIES: PurchaseCurrency[] = ["USD", "RUB", "TRY", "EUR"];

export type Purchase = {
  id: string;
  marketplace_account_id: string;
  purchase_date: string;
  supplier: string;
  currency: PurchaseCurrency;
  exchange_rate: number | null;
  /** Optional supplier invoice / document number. */
  invoice_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseLine = {
  id: string;
  purchase_id: string;
  product_id: string;
  supplier_article: string;
  quantity: number;
  unit_cost: number;
  created_at: string;
  product_name?: string;
};

export type PurchaseWithLines = Purchase & {
  lines: PurchaseLine[];
  line_count: number;
  /** Σ quantity × unit_cost for this purchase (purchase currency). */
  total_cost: number;
};

export type PurchaseListLinePreview = {
  id: string;
  supplier_article: string;
  product_name?: string | null;
  quantity: number;
  unit_cost: number;
};

export type PurchaseListItem = Purchase & {
  line_count: number;
  /** Distinct supplier_article values from purchase lines (deep-link search). */
  supplierArticles: string[];
  /** Σ quantity × unit_cost (purchase currency). */
  total_cost: number;
  /** Line previews for inline expansion (cost history ledger). */
  lines: PurchaseListLinePreview[];
};

export type PurchaseImportResult = {
  purchaseId: string;
  productsImported: number;
  /** Products that received their first cost-history row in this import. */
  newProducts: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

export type ProductWithRelations = Product & {
  brand: Brand | null;
  category: Category | null;
};

export type DateRange = {
  from: string;
  to: string;
};

/** Active marketplace account scope for queries. */
export type AccountScope = {
  marketplaceAccountId: string;
  companyId: string;
};

export type ScopedDateRange = DateRange & AccountScope & {
  /** When omitted, all brands for the marketplace account apply. */
  brandId?: string;
};

export type ProfitBreakdown = {
  revenue: number;
  productCost: number;
  commission: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  penalties: number;
  otherExpenses: number;
  netProfit: number;
  returnRate: number;
  unitsSold: number;
  unitsReturned: number;
};

export type ProfitabilityV2BreakdownLine = {
  key: string;
  label: string;
  amount: number;
  isDeduction?: boolean;
  isTotal?: boolean;
  detail?: string;
};

export type ProductProfitability = ProfitBreakdown & {
  productId: string;
  modelCode: string;
  productName: string;
  categoryName: string;
  brandName: string;
  /**
   * Model B Net Sales (priceWithDisc net) — Customer Payment baseline.
   * `revenue` on this row is Commercial Performance Revenue (Finance ppvz_for_pay).
   */
  netSales: number;
  /**
   * Model B Final Net Profit (after tax).
   * `netProfit` remains Operating Profit (before tax) for Smart Pricing / ops compatibility.
   */
  finalNetProfit: number;
  /** Marketplace Fee = Sales − Sales API forPay (Financial Engine V4). */
  marketplaceFees: number;
  /** Account-level ADJUSTMENT deductions — separate from Marketplace Fees KPI. */
  accountAdjustments: number;
  /** COMPENSATION reimbursements — separate from Marketplace Fees KPI. */
  reimbursements: number;
  /** All wb_orders quantity in period. */
  orders: number;
  /** Completed purchase quantity (non-return wb_sales) in period. */
  purchases: number;
  /** Purchases ÷ orders × 100. */
  conversionPercent: number;
  /** Cancelled wb_orders quantity in period. */
  cancelled: number;
  /** Cancelled ÷ orders × 100. */
  cancellationPercent: number;
  /** Outbound logistics matched to a completed purchase SRID (same as `logistics`). */
  purchaseLogistics: number;
  /** Outbound logistics excluded from net profit (cancelled / unknown / missing SRID). */
  excludedLogistics: number;
  /** Logistics rows matched to a completed purchase SRID. */
  purchaseLogisticsRows: number;
  /** Logistics rows excluded (cancelled / unknown / missing SRID). */
  excludedLogisticsRows: number;
};

/** Top-N product audit row for /audit/product-profitability. */
export type ProductProfitabilityAuditRow = {
  productId: string;
  supplierArticle: string;
  productName: string;
  revenue: number;
  quantitySold: number;
  commission: number;
  logistics: number;
  returnLogistics: number;
  deductions: number;
  productCost: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
};

/** Product analytics row for /analytics/products. */
export type ProductAnalyticsRow = {
  productId: string;
  supplierArticle: string;
  productName: string;
  revenue: number;
  quantitySold: number;
  productCost: number;
  marketplaceFees: number;
  netProfit: number;
  marginPercent: number;
};

/** Product Analytics V3 row — one SKU in period. */
export type ProductAnalyticsV3Row = {
  productId: string;
  supplierArticle: string;
  productName: string;
  orders: number;
  purchases: number;
  conversionPercent: number;
  cancelled: number;
  cancellationPercent: number;
  revenue: number;
  marketplaceFees: number;
  commission: number;
  /** All outbound logistics (purchase + excluded). */
  totalLogistics: number;
  purchaseLogistics: number;
  excludedLogistics: number;
  returnLogistics: number;
  otherMarketplaceCosts: number;
  productCost: number;
  operationalProfit: number;
  /** Operational profit ÷ revenue × 100. */
  operationalMarginPercent: number;
  /** Financial net profit (Model B engine). */
  financialNetProfit: number;
  /** Total current stock from inventory cache — links to Inventory page. */
  currentStock: number;
};

export type InventoryRecommendation =
  | "Healthy"
  | "Stop Purchasing"
  | "Overstock"
  | "Produce / Purchase";

/** Lazy-loaded SKU row under a model (parent) in Product Analytics. */
export type ProductAnalyticsSkuRow = {
  variantKey: string;
  size: string;
  barcode: string | null;
  currentStock: number;
  orders: number;
  purchases: number;
  conversionPercent: number;
  cancelled: number;
  cancellationPercent: number;
  revenue: number;
};

export type ProductSkuAnalyticsResponse = {
  productId: string;
  supplierArticle: string;
  skus: ProductAnalyticsSkuRow[];
  /**
   * Product-level funnel for the scoped period — same `buildProductFunnelMetrics`
   * used by Product Analytics (orders → purchases → conversion).
   * Favorites / cart counts are not in this pipeline (WB Sales Funnel API, unsynced).
   */
  funnel: {
    orders: number;
    purchases: number;
    conversionPercent: number;
    cancelled: number;
    cancellationPercent: number;
  };
  loadTimeMs: number;
};

/** Sum of all product rows in period — validation totals. */
export type ProductAnalyticsTotals = {
  productCount: number;
  revenue: number;
  productCost: number;
  marketplaceFees: number;
  /** Purchase-only outbound logistics included in net profit. */
  purchaseLogistics: number;
  /** Excluded outbound logistics (not in net profit). */
  excludedLogistics: number;
  returnLogistics: number;
  /** Financial net profit (dashboard engine). */
  netProfit: number;
  purchaseLogisticsRows: number;
  excludedLogisticsRows: number;
  /** Operational rollups (V3 row set). */
  totalLogistics: number;
  otherMarketplaceCosts: number;
  operationalProfit: number;
  operationalMarginPercent: number;
  /** V3 funnel rollups (V3 row set). */
  orders: number;
  purchases: number;
  conversionPercent: number;
  cancelled: number;
  cancellationPercent: number;
  /** Orders − purchases. */
  lostOrders: number;
  commission: number;
  marketing: number;
  marginPercent: number;
};

export type ProductVariant = {
  id: string;
  marketplace_account_id: string;
  product_id: string;
  nm_id: number | null;
  tech_size: string;
  barcode: string | null;
  created_at: string;
};

export type WbStock = {
  id: string;
  marketplace_account_id: string;
  product_id: string;
  tech_size: string;
  barcode: string | null;
  warehouse: string | null;
  quantity: number;
  quantity_full: number;
  in_way_to_client: number;
  in_way_from_client: number;
  last_synced_at: string;
};

/** Sprint 10 — historical warehouse inventory snapshot row. */
export type HistoricalInventorySnapshotRow = {
  id: number;
  snapshot_date: string;
  marketplace_account_id: number;
  warehouse_name: string;
  brand: string;
  subject: string;
  seller_article: string;
  nm_id: number;
  barcode: string;
  size: string;
  quantity: number;
  in_way_to_client: number;
  in_way_from_client: number;
  created_at: string;
};

/**
 * Dimension rollup (Category / Brand / future) from Model B product outputs.
 * `revenue` = Model B forPay; `finalNetProfit` = Model B after-tax profit.
 */
export type GroupedProfitability = {
  id: string;
  name: string;
  revenue: number;
  finalNetProfit: number;
  productCount: number;
  returnRate: number;
};

/**
 * @deprecated Prefer GroupedProfitability. Legacy aliases kept for older call sites.
 * `netProfit` mirrors `finalNetProfit` after Sprint 6.36.
 */
export type CategoryProfitability = GroupedProfitability & {
  categoryId: string;
  categoryName: string;
  netProfit: number;
};

export type DailyOrdersPurchasesPoint = {
  date: string;
  ordersCount: number;
  ordersAmount: number;
  purchasesCount: number;
  purchasesAmount: number;
};

export type OrdersPurchasesKpis = {
  /** Sum of price × qty for all orders in range, including cancelled. */
  ordersValue: number;
  ordersValueCount: number;
  ordersCount: number;
  ordersAmount: number;
  cancelledOrdersCount: number;
  cancelledOrdersAmount: number;
  purchasesCount: number;
  purchasesAmount: number;
  conversionRate: number;
  returnRate: number;
  dailyOrdersPurchases: DailyOrdersPurchasesPoint[];
};

export type CashReceivedMetrics = {
  /** Total bank transfers (bankPaymentSum) with payment date in range; null when unavailable. */
  amount: number | null;
  payoutCount: number;
  unavailableReason?: string;
};

export type ExpectedWbPayoutMetrics = {
  /** Sum of bankPaymentSum for realization reports overlapping the dashboard range. */
  amount: number | null;
  reportCount: number;
  unavailableReason?: string;
};

export type WbBalanceMetrics = {
  /** Total wallet balance (portal). */
  current: number | null;
  /** Available to withdraw (portal). */
  forWithdraw: number | null;
  currency: string | null;
  unavailableReason?: string;
};

export type OverviewMetrics = ProfitBreakdown & {
  dailyRevenue: { date: string; revenue: number; profit: number }[];
  costBreakdown: { name: string; value: number; color: string }[];
  ordersPurchases: OrdersPurchasesKpis;
  marketplaceFeesPresentation: MarketplaceFeesPresentation;
  modelBProfit: ModelBProfitMetrics;
  modelCProfit: ModelCProfitMetrics;
  wbSettlement: WbSettlementMetrics;
  quantityMetrics: QuantityMetrics;
  cashReceived: CashReceivedMetrics;
  expectedWbPayout: ExpectedWbPayoutMetrics;
  wbBalance: WbBalanceMetrics;
};

/** Minimal Supabase relationship entry (no FK metadata required for typed client). */
type NoRelationships = [];

type PublicTables = {
  companies: {
    Row: Company;
    Insert: {
      name: string;
      country?: string | null;
      currency?: string;
      timezone?: string;
      language?: string;
      is_default?: boolean;
      status?: CompanyStatus;
      default_tax_percent?: number;
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: Partial<Omit<Company, "id">>;
    Relationships: NoRelationships;
  };
  marketplace_accounts: {
    Row: MarketplaceAccount;
    Insert: {
      company_id: string;
      marketplace: MarketplaceType;
      account_name: string;
      seller_id?: string | null;
      api_key_encrypted?: string;
      is_active?: boolean;
      is_default?: boolean;
      sync_enabled?: boolean;
      last_sync_at?: string | null;
      last_successful_sync_at?: string | null;
      last_sync_status?: SyncStatus | null;
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: Partial<Omit<MarketplaceAccount, "id">>;
    Relationships: NoRelationships;
  };
  brands: {
    Row: Brand;
    Insert: Omit<Brand, "id" | "created_at"> & { id?: string; created_at?: string };
    Update: Partial<Brand>;
    Relationships: NoRelationships;
  };
  categories: {
    Row: Category;
    Insert: Omit<Category, "id" | "created_at"> & { id?: string; created_at?: string };
    Update: Partial<Category>;
    Relationships: NoRelationships;
  };
  products: {
    Row: Product;
    Insert: Omit<Product, "id" | "created_at"> & { id?: string; created_at?: string };
    Update: Partial<Product>;
    Relationships: NoRelationships;
  };
  wb_orders: {
    Row: WbOrder;
    Insert: Omit<WbOrder, "id"> & { id?: string };
    Update: Partial<WbOrder>;
    Relationships: NoRelationships;
  };
  wb_sales: {
    Row: WbSale;
    Insert: Omit<WbSale, "id"> & { id?: string };
    Update: Partial<WbSale>;
    Relationships: NoRelationships;
  };
  wb_finance: {
    Row: WbFinance;
    Insert: Omit<WbFinance, "id"> & { id?: string };
    Update: Partial<WbFinance>;
    Relationships: NoRelationships;
  };
  sync_runs: {
    Row: SyncRun;
    Insert: Partial<Omit<SyncRun, "id" | "created_at">> & {
      marketplace_account_id: string;
      trigger: SyncRunTrigger;
      entities: string[];
      id?: string;
      created_at?: string;
    };
    Update: Partial<SyncRun>;
    Relationships: NoRelationships;
  };
  commercial_entity_sync_state: {
    Row: CommercialEntitySyncStateRow;
    Insert: Partial<CommercialEntitySyncStateRow> & {
      marketplace_account_id: string;
      entity: "orders" | "sales" | "finance";
    };
    Update: Partial<CommercialEntitySyncStateRow>;
    Relationships: NoRelationships;
  };
  commercial_sync_ticks: {
    Row: CommercialSyncTickRow;
    Insert: Partial<Omit<CommercialSyncTickRow, "id" | "created_at">> & {
      id?: string;
      trigger?: string;
      created_at?: string;
    };
    Update: Partial<CommercialSyncTickRow>;
    Relationships: NoRelationships;
  };
  finance_incremental_sync_state: {
    Row: FinanceIncrementalSyncStateRow;
    Insert: Partial<FinanceIncrementalSyncStateRow> & {
      marketplace_account_id: string;
    };
    Update: Partial<FinanceIncrementalSyncStateRow>;
    Relationships: NoRelationships;
  };
  finance_sync_reports: {
    Row: FinanceSyncReportRow;
    Insert: Omit<FinanceSyncReportRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    };
    Update: Partial<FinanceSyncReportRow>;
    Relationships: NoRelationships;
  };
  wb_ads: {
    Row: WbAd;
    Insert: Omit<WbAd, "id"> & { id?: string };
    Update: Partial<WbAd>;
    Relationships: NoRelationships;
  };
  product_cost_history: {
    Row: ProductCostHistory;
    Insert: Omit<ProductCostHistory, "id" | "created_at" | "effective_to"> & {
      id?: string;
      created_at?: string;
      effective_to?: string | null;
    };
    Update: Partial<ProductCostHistory>;
    Relationships: NoRelationships;
  };
  purchases: {
    Row: Purchase;
    Insert: Omit<Purchase, "id" | "created_at" | "updated_at"> & {
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
    Update: Partial<Purchase>;
    Relationships: NoRelationships;
  };
  purchase_lines: {
    Row: PurchaseLine;
    Insert: Omit<PurchaseLine, "id" | "created_at" | "product_name"> & {
      id?: string;
      created_at?: string;
    };
    Update: Partial<PurchaseLine>;
    Relationships: NoRelationships;
  };
  product_variants: {
    Row: ProductVariant;
    Insert: Omit<ProductVariant, "id" | "created_at"> & { id?: string; created_at?: string };
    Update: Partial<ProductVariant>;
    Relationships: NoRelationships;
  };
  wb_stock: {
    Row: WbStock;
    Insert: Omit<WbStock, "id"> & { id?: string };
    Update: Partial<WbStock>;
    Relationships: NoRelationships;
  };
  historical_inventory_snapshots: {
    Row: HistoricalInventorySnapshotRow;
    Insert: Omit<
      HistoricalInventorySnapshotRow,
      "id" | "created_at" | "in_way_to_client" | "in_way_from_client"
    > & {
      id?: number;
      created_at?: string;
      in_way_to_client?: number;
      in_way_from_client?: number;
    };
    Update: Partial<HistoricalInventorySnapshotRow>;
    Relationships: NoRelationships;
  };
  administration_audit_events: {
    Row: {
      id: string;
      created_at: string;
      user_id: string | null;
      user_email: string | null;
      company_id: string | null;
      module: string;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      result: string;
      event_kind: string;
      reason: string | null;
      correlation_id: string | null;
      device: string | null;
      ip_masked: string | null;
      metadata: Record<string, unknown>;
    };
    Insert: {
      user_id?: string | null;
      user_email?: string | null;
      company_id?: string | null;
      module: string;
      action: string;
      entity_type?: string | null;
      entity_id?: string | null;
      result: string;
      event_kind: string;
      reason?: string | null;
      correlation_id?: string | null;
      device?: string | null;
      ip_masked?: string | null;
      metadata?: Record<string, unknown>;
      id?: string;
      created_at?: string;
    };
    Update: Partial<Omit<PublicTables["administration_audit_events"]["Row"], "id" | "created_at">>;
    Relationships: NoRelationships;
  };
  platform_settings: {
    Row: {
      id: string;
      settings: unknown;
      updated_at: string;
      updated_by: string | null;
    };
    Insert: {
      id?: string;
      settings?: unknown;
      updated_at?: string;
      updated_by?: string | null;
    };
    Update: Partial<Omit<PublicTables["platform_settings"]["Row"], "id">>;
    Relationships: NoRelationships;
  };
  warehouse_account_balance: {
    Row: {
      id: number;
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      currency: string | null;
      current_amount: number | null;
      for_withdraw_amount: number | null;
      observed_at: string;
      meta: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      currency?: string | null;
      current_amount?: number | null;
      for_withdraw_amount?: number | null;
      observed_at?: string;
      meta?: Record<string, unknown>;
      id?: number;
    };
    Update: Partial<Omit<PublicTables["warehouse_account_balance"]["Row"], "id" | "created_at">>;
    Relationships: NoRelationships;
  };
  warehouse_sales_report_snapshot: {
    Row: {
      id: number;
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      report_id: number;
      date_from: string;
      date_to: string;
      create_date: string;
      currency: string | null;
      report_type: number | null;
      retail_amount_sum: number | null;
      for_pay_sum: number | null;
      bank_payment_sum: number | null;
      seller_finance_name: string | null;
      observed_at: string;
      meta: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      report_id: number;
      date_from: string;
      date_to: string;
      create_date: string;
      currency?: string | null;
      report_type?: number | null;
      retail_amount_sum?: number | null;
      for_pay_sum?: number | null;
      bank_payment_sum?: number | null;
      seller_finance_name?: string | null;
      observed_at?: string;
      meta?: Record<string, unknown>;
      id?: number;
    };
    Update: Partial<Omit<PublicTables["warehouse_sales_report_snapshot"]["Row"], "id" | "created_at">>;
    Relationships: NoRelationships;
  };
  warehouse_entity_sync_state: {
    Row: {
      id: number;
      marketplace_account_id: number;
      entity: string;
      stage: string;
      progress: Record<string, unknown>;
      started_at: string | null;
      completed_at: string | null;
      last_successful_sync_at: string | null;
      last_failed_sync_at: string | null;
      current_dataset: string | null;
      current_page: number | null;
      error_message: string | null;
      retry_count: number;
      updated_at: string;
      created_at: string;
    };
    Insert: {
      marketplace_account_id: number;
      entity: string;
      stage?: string;
      progress?: Record<string, unknown>;
      started_at?: string | null;
      completed_at?: string | null;
      last_successful_sync_at?: string | null;
      last_failed_sync_at?: string | null;
      current_dataset?: string | null;
      current_page?: number | null;
      error_message?: string | null;
      retry_count?: number;
      updated_at?: string;
      id?: number;
    };
    Update: Partial<{
      stage: string;
      progress: Record<string, unknown>;
      started_at: string | null;
      completed_at: string | null;
      last_successful_sync_at: string | null;
      last_failed_sync_at: string | null;
      current_dataset: string | null;
      current_page: number | null;
      error_message: string | null;
      retry_count: number;
      updated_at: string;
    }>;
    Relationships: NoRelationships;
  };
  warehouse_import_audit: {
    Row: {
      id: string;
      marketplace_account_id: number;
      entity: string;
      trigger: string;
      status: string;
      started_at: string;
      finished_at: string | null;
      duration_ms: number | null;
      current_dataset: string | null;
      current_page: number | null;
      records_read: number;
      rows_inserted: number;
      rows_updated: number;
      rows_skipped: number;
      validation_result: string | null;
      errors: unknown[];
      meta: Record<string, unknown>;
      created_at: string;
    };
    Insert: {
      marketplace_account_id: number;
      entity: string;
      trigger?: string;
      status?: string;
      current_dataset?: string | null;
      current_page?: number | null;
      meta?: Record<string, unknown>;
      id?: string;
    };
    Update: Partial<{
      status: string;
      finished_at: string | null;
      duration_ms: number | null;
      current_dataset: string | null;
      current_page: number | null;
      records_read: number;
      rows_inserted: number;
      rows_updated: number;
      rows_skipped: number;
      validation_result: string | null;
      errors: unknown[];
      meta: Record<string, unknown>;
    }>;
    Relationships: NoRelationships;
  };
  warehouse_entity_catalog: {
    Row: {
      entity: string;
      label: string;
      layer: string;
      description: string;
      is_required_for_healthy: boolean;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      entity: string;
      label: string;
      layer?: string;
      description?: string;
      is_required_for_healthy?: boolean;
    };
    Update: Partial<{
      label: string;
      layer: string;
      description: string;
      is_required_for_healthy: boolean;
      updated_at: string;
    }>;
    Relationships: NoRelationships;
  };
  warehouse_checkpoints: {
    Row: {
      id: number;
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      entity: string;
      mode: string;
      shard: string;
      cursor: string | null;
      window_start: string | null;
      window_end: string | null;
      status: string;
      progress: Record<string, unknown>;
      retry_count: number;
      last_successful_sync_at: string | null;
      last_attempted_sync_at: string | null;
      lease_owner: string | null;
      lease_until: string | null;
      error_code: string | null;
      error_message: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      entity: string;
      mode: string;
      shard?: string;
      cursor?: string | null;
      window_start?: string | null;
      window_end?: string | null;
      status?: string;
      progress?: Record<string, unknown>;
      retry_count?: number;
      last_successful_sync_at?: string | null;
      last_attempted_sync_at?: string | null;
      lease_owner?: string | null;
      lease_until?: string | null;
      error_code?: string | null;
      error_message?: string | null;
      id?: number;
    };
    Update: Partial<{
      cursor: string | null;
      window_start: string | null;
      window_end: string | null;
      status: string;
      progress: Record<string, unknown>;
      retry_count: number;
      last_successful_sync_at: string | null;
      last_attempted_sync_at: string | null;
      lease_owner: string | null;
      lease_until: string | null;
      error_code: string | null;
      error_message: string | null;
      updated_at: string;
    }>;
    Relationships: NoRelationships;
  };
  warehouse_sync_sessions: {
    Row: {
      id: string;
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      entity: string;
      mode: string;
      trigger_source: string;
      status: string;
      started_at: string | null;
      finished_at: string | null;
      checkpoint_id: number | null;
      statistics: Record<string, unknown>;
      error_code: string | null;
      error_message: string | null;
      meta: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      entity: string;
      mode: string;
      trigger_source?: string;
      status?: string;
      started_at?: string | null;
      finished_at?: string | null;
      checkpoint_id?: number | null;
      statistics?: Record<string, unknown>;
      error_code?: string | null;
      error_message?: string | null;
      meta?: Record<string, unknown>;
      id?: string;
    };
    Update: Partial<{
      status: string;
      started_at: string | null;
      finished_at: string | null;
      checkpoint_id: number | null;
      statistics: Record<string, unknown>;
      error_code: string | null;
      error_message: string | null;
      meta: Record<string, unknown>;
      updated_at: string;
    }>;
    Relationships: NoRelationships;
  };
  warehouse_raw_intake_meta: {
    Row: {
      id: string;
      session_id: string | null;
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      entity: string;
      endpoint_family: string;
      request_fingerprint: string | null;
      window_from: string | null;
      window_to: string | null;
      cursor_before: string | null;
      cursor_after: string | null;
      http_status_class: string | null;
      payload_digest: string | null;
      records_read: number;
      meta: Record<string, unknown>;
      created_at: string;
    };
    Insert: {
      marketplace_type: string;
      company_id: number;
      marketplace_account_id: number;
      entity: string;
      session_id?: string | null;
      endpoint_family?: string;
      request_fingerprint?: string | null;
      window_from?: string | null;
      window_to?: string | null;
      cursor_before?: string | null;
      cursor_after?: string | null;
      http_status_class?: string | null;
      payload_digest?: string | null;
      records_read?: number;
      meta?: Record<string, unknown>;
      id?: string;
    };
    Update: Partial<{
      records_read: number;
      meta: Record<string, unknown>;
      cursor_after: string | null;
      http_status_class: string | null;
      payload_digest: string | null;
    }>;
    Relationships: NoRelationships;
  };
  warehouse_layer_registry: {
    Row: {
      layer: string;
      label: string;
      description: string;
      created_at: string;
    };
    Insert: {
      layer: string;
      label: string;
      description: string;
    };
    Update: Partial<{
      label: string;
      description: string;
    }>;
    Relationships: NoRelationships;
  };
};

/** Row type for a public schema table. */
export type TableRow<T extends keyof PublicTables> = PublicTables[T]["Row"];

/** Partial row pick for typed `.select("col")` results. */
export type TableRowPick<T extends keyof PublicTables, K extends keyof TableRow<T>> = Pick<
  TableRow<T>,
  K
>;

export type Database = {
  public: {
    Tables: PublicTables;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
