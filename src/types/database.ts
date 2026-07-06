export type MarketplaceType = "wildberries" | "ozon" | "lamoda";

export const MARKETPLACE_TYPES: MarketplaceType[] = ["wildberries", "ozon", "lamoda"];

export type SyncStatus = "idle" | "running" | "success" | "partial" | "failed";

export const SYNC_STATUSES: SyncStatus[] = ["idle", "running", "success", "partial", "failed"];

export type Company = {
  id: string;
  name: string;
  country: string | null;
  currency: string;
  timezone: string;
  language: string;
  is_default: boolean;
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
  price: number;
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
  quantity: number;
  is_return: boolean;
  return_date: string | null;
  tech_size: string | null;
  barcode: string | null;
};

export type FinanceOperationType =
  | "commission"
  | "logistics"
  | "return_logistics"
  | "storage"
  | "penalty"
  | "other";

/** All wb_finance operation types included in net profit. */
export const FINANCE_OPERATION_TYPES: FinanceOperationType[] = [
  "commission",
  "logistics",
  "return_logistics",
  "storage",
  "penalty",
  "other",
];

export type WbFinance = {
  id: string;
  marketplace_account_id: string;
  product_id: string | null;
  nm_id: number | null;
  operation_date: string;
  operation_type: FinanceOperationType;
  amount: number;
  /** Wildberries line id: rrd:{rrd_id}:{suffix} — unique per report line. */
  source_key: string | null;
  description: string | null;
  /** Shipment/order id from WB reportDetailByPeriod — used for purchase logistics attribution. */
  srid: string | null;
};

export type WbAd = {
  id: string;
  product_id: string | null;
  supplier_article: string | null;
  nm_id: number | null;
  campaign_date: string;
  spend: number;
  clicks: number;
  impressions: number;
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
};

export type PurchaseListItem = Purchase & {
  line_count: number;
};

export type PurchaseImportResult = {
  purchaseId: string;
  productsImported: number;
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

export type ProfitabilityV2Metrics = {
  productCost: number;
  grossProfit: number;
  marketplaceFees: number;
  marginPercent: number;
  advertising: number;
  breakdown: ProfitabilityV2BreakdownLine[];
};

export type ProductProfitability = ProfitBreakdown & {
  productId: string;
  modelCode: string;
  productName: string;
  categoryName: string;
  brandName: string;
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
  /** Financial net profit (buildProfitBreakdown) — for reconciliation only. */
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
};

export type ProductSkuAnalyticsResponse = {
  productId: string;
  supplierArticle: string;
  skus: ProductAnalyticsSkuRow[];
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

export type CategoryProfitability = {
  categoryId: string;
  categoryName: string;
  revenue: number;
  netProfit: number;
  productCount: number;
  returnRate: number;
};

export type DailyOrdersPurchasesPoint = {
  date: string;
  ordersCount: number;
  ordersAmount: number;
  purchasesCount: number;
  purchasesAmount: number;
};

export type OrdersPurchasesKpis = {
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

export type OverviewMetrics = ProfitBreakdown & {
  dailyRevenue: { date: string; revenue: number; profit: number }[];
  costBreakdown: { name: string; value: number; color: string }[];
  ordersPurchases: OrdersPurchasesKpis;
  profitabilityV2: ProfitabilityV2Metrics;
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
