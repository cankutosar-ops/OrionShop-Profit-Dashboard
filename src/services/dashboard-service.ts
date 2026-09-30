import { cache } from "react";
import { createServerClient, type SupabaseClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { withReadBudget } from "@/lib/supabase/read-budget";
import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import { buildCostBreakdown } from "@/lib/cost-breakdown-chart";
import { groupSalesByDate } from "@/lib/daily-revenue-series";
import { rollupCategoriesToProfitBuckets } from "@/lib/finance-rollup";
import { computeProductCost } from "@/lib/product-cost";
import { aggregateSalesMetrics } from "@/lib/sales-metrics";
import { buildOrdersPurchasesKpis } from "@/lib/orders-purchases-metrics";
import { buildProductProfitabilityRows, buildProductProfitabilityResult } from "@/lib/product-profitability-builder";
import {
  alignGroupedProfitabilityToModelB,
  buildDimensionProfitability,
} from "@/lib/dimension-profitability";
import { buildMarketplaceFeesPresentation } from "@/lib/marketplace-fees-presentation";
import { buildModelBProfitMetrics } from "@/lib/financial-engine";
import { buildModelCProfitMetrics } from "@/lib/profit-engine-model-c";
import { summarizeFinanceByCategory } from "@/lib/finance-rollup";
import {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
  sumReturnedFinishedPriceFromDb,
} from "@/lib/sales-revenue-resolution";
import {
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} from "@/lib/wb-settlement";
import {
  measureAsync,
  measureSync,
  recordPerfEvent,
  runWithPerfRequest,
} from "@/lib/perf/perf-recorder";
import { resolveOrdersValue } from "@/services/orders-value-service";
import { resolveNetSales } from "@/services/sales-revenue-service";
import { getWbSettlementMetrics } from "@/services/wb-settlement-service";
import { logScopeAudit } from "@/lib/scope-audit-log";
import {
  buildCashReceivedMetricsFromReports,
  buildExpectedWbPayoutMetricsFromReports,
  loadWbWeeklySalesReports,
  type WbSalesReportsLoadResult,
} from "@/services/wb-sales-reports-service";
import { getWbBalanceMetrics } from "@/services/wb-balance-service";
import { getDashboardTaxInputs } from "@/services/company-tax-service";
import { calculateTaxYtd } from "@/lib/tax-engine/calculator";
import {
  getSampleDashboard,
  getEmptyPeriodDashboard,
  type DashboardPayload,
} from "@/lib/sample-data";
import {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import type {
  CategoryProfitability,
  GroupedProfitability,
  ModelBProfitMetrics,
  OverviewMetrics,
  ProductCostHistory,
  ProductProfitability,
  ProductWithRelations,
  ScopedDateRange,
  WbAd,
  WbFinance,
  WbOrder,
  WbSale,
  WbSettlementMetrics,
} from "@/types/database";
import type {
  CashReceivedMetrics,
  ExpectedWbPayoutMetrics,
  WbBalanceMetrics,
} from "@/types/database";

export {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";

type ScopedDashboardSqlRaw = {
  products: ProductWithRelations[];
  productIds: string[];
  supplierArticles: string[];
  sales: WbSale[];
  finance: WbFinance[];
  ads: WbAd[];
  costHistory: ProductCostHistory[];
  orders: WbOrder[];
};

type ScopedDashboardRaw = ScopedDashboardSqlRaw & {
  salesReports: WbSalesReportsLoadResult;
  cashReceived: CashReceivedMetrics;
  expectedWbPayout: ExpectedWbPayoutMetrics;
  wbBalance: WbBalanceMetrics;
};

function hasDashboardActivity(raw: ScopedDashboardSqlRaw): boolean {
  return raw.orders.length > 0 || raw.sales.length > 0 ||
    raw.finance.length > 0 || raw.ads.length > 0;
}

// Keep dashboard payloads narrow. The fact tables also contain ingestion and
// audit metadata that is not used by Financial Engine calculations; selecting
// `*` multiplied transfer size and JSON parsing time on established accounts.
const DASHBOARD_ORDER_COLUMNS =
  "product_id, order_date, price, price_with_disc, quantity, status";
const DASHBOARD_SALES_COLUMNS =
  "srid, nm_id, product_id, sale_date, revenue, price_with_disc, for_pay, quantity, is_return";
const DASHBOARD_FINANCE_COLUMNS =
  "id, product_id, nm_id, operation_type, amount, raw_amount, source_key, description, srid, finance_category, wb_source_suffix, supplier_oper_name";

async function isDatabaseEmpty(
  client: SupabaseClient,
  marketplaceAccountId: string
): Promise<boolean> {
  const [sales, finance, ads, products] = await Promise.all([
    client
      .from("wb_sales")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
    client
      .from("wb_finance")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
    // Account-scoped like its siblings: an unfiltered count would report this
    // account's warehouse as non-empty because a *different* account has ads.
    client
      .from("wb_ads")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
    client
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("marketplace_account_id", marketplaceAccountId),
  ]);

  const total =
    (sales.count ?? 0) + (finance.count ?? 0) + (ads.count ?? 0) + (products.count ?? 0);

  return total === 0;
}

async function fetchAccountLastSync(
  client: SupabaseClient,
  marketplaceAccountId: string
): Promise<string | null> {
  const { data } = await client
    .from("marketplace_accounts")
    .select("last_successful_sync_at, last_sync_at")
    .eq("id", marketplaceAccountId)
    .maybeSingle();

  return data?.last_successful_sync_at ?? data?.last_sync_at ?? null;
}

/** SQL-only scoped fetch — shared across Suspense segments via react.cache. */
async function fetchScopedDashboardSql(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<ScopedDashboardSqlRaw> {
  const productsPromise = fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
    columns:
      "id, marketplace_account_id, supplier_article, nm_id, name, brand_id, category_id, brand:brands(id,name), category:categories(id,name)",
  });
  const accountRangePromise = scope.brandId
    ? null
    : Promise.all([
        fetchSalesInRange(scope, client, { columns: DASHBOARD_SALES_COLUMNS }),
        fetchFinanceInRange(scope, client, { columns: DASHBOARD_FINANCE_COLUMNS }),
        fetchOrdersInRange(scope, client, { columns: DASHBOARD_ORDER_COLUMNS }),
      ]);
  // Products may fail before the concurrently started range queries settle.
  // Handle that rejection immediately; the awaited promise below still fails.
  void accountRangePromise?.catch(() => {});
  const products = await productsPromise;
  const productIds = products.map((product) => String(product.id));
  const supplierArticles = products.map((product) => product.supplier_article);
  // Account-wide dashboard reads are already isolated by marketplace_account_id.
  // Adding every catalogue product to an `in (...)` filter creates extremely
  // large URLs (hundreds of IDs on established stores) on every paginated
  // request. Keep the product filter only when a brand drill-down requires it.
  const scopedProductIds = scope.brandId ? productIds : undefined;

  const [rangeRows, ads, costHistory] = await Promise.all([
    accountRangePromise ?? Promise.all([
      fetchSalesInRange(scope, client, { productIds: scopedProductIds, columns: DASHBOARD_SALES_COLUMNS }),
      fetchFinanceInRange(scope, client, { productIds: scopedProductIds, columns: DASHBOARD_FINANCE_COLUMNS }),
      fetchOrdersInRange(scope, client, { productIds: scopedProductIds, columns: DASHBOARD_ORDER_COLUMNS }),
    ]),
    fetchAdsInRange(scope, client, {
      productIds,
      supplierArticles,
      columns: "product_id, campaign_date, spend",
    }),
    fetchCostHistory(scope.marketplaceAccountId, client, {
      productIds,
      columns: "id, product_id, cost, effective_from, effective_to, created_at",
    }),
  ]);
  const [sales, finance, orders] = rangeRows;

  return {
    products,
    productIds,
    supplierArticles,
    sales,
    finance,
    ads,
    costHistory,
    orders,
  };
}

/**
 * Per-request dedupe of SQL dashboard fetch (avoid rebuilding across Suspense children).
 */
export const getCachedDashboardSql = cache(
  async (
    marketplaceAccountId: string,
    companyId: string,
    from: string,
    to: string,
    brandId: string
  ): Promise<ScopedDashboardSqlRaw> => {
    return fetchScopedDashboardSql({
      marketplaceAccountId,
      companyId,
      from,
      to,
      ...(brandId ? { brandId } : {}),
    });
  }
);

async function loadSqlForScope(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<ScopedDashboardSqlRaw> {
  // Prefer react.cache path so Core + WB Suspense segments share one SQL load.
  if (!client) {
    return getCachedDashboardSql(
      scope.marketplaceAccountId,
      scope.companyId,
      scope.from,
      scope.to,
      scope.brandId ?? ""
    );
  }
  return fetchScopedDashboardSql(scope, client);
}

/** Single scoped fetch: SQL + warehouse KPI snapshots in parallel (no marketplace HTTP). */
async function fetchScopedDashboardRaw(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<ScopedDashboardRaw> {
  const sqlPromise = loadSqlForScope(scope, client);
  const kpiPromise = Promise.all([
    loadWbWeeklySalesReports(scope),
    getWbBalanceMetrics(scope.marketplaceAccountId),
  ]);

  const [sql, [salesReports, wbBalance]] = await Promise.all([sqlPromise, kpiPromise]);

  const cashReceived = buildCashReceivedMetricsFromReports(scope, salesReports);
  const expectedWbPayout = buildExpectedWbPayoutMetricsFromReports(scope, salesReports);

  return {
    ...sql,
    salesReports,
    cashReceived,
    expectedWbPayout,
    wbBalance,
  };
}

function toLegacyCategory(row: GroupedProfitability): CategoryProfitability {
  return {
    ...row,
    categoryId: row.id,
    categoryName: row.name,
    netProfit: row.finalNetProfit,
  };
}

function buildGroupedViews(
  products: ProductProfitability[],
  modelB: ModelBProfitMetrics
): { categories: GroupedProfitability[]; brands: GroupedProfitability[] } {
  return {
    categories: alignGroupedProfitabilityToModelB(
      buildDimensionProfitability(products, "category"),
      modelB
    ),
    brands: alignGroupedProfitabilityToModelB(
      buildDimensionProfitability(products, "brand"),
      modelB
    ),
  };
}

const LOADING_SETTLEMENT: WbSettlementMetrics = {
  netForPay: 0,
  logistics: 0,
  storage: 0,
  penalties: 0,
  deductions: 0,
  acceptance: 0,
  settlement: 0,
  dataSource: "weekly_reports",
  availability: {
    available: false,
    latestRealizationReportDate: null,
    selectedFrom: "",
    selectedTo: "",
  },
};

function buildSqlOnlyRaw(sql: ScopedDashboardSqlRaw): ScopedDashboardRaw {
  return {
    ...sql,
    salesReports: { kind: "unsupported" },
    cashReceived: { amount: null, payoutCount: 0, unavailableReason: "Loading…" },
    expectedWbPayout: { amount: null, reportCount: 0, unavailableReason: "Loading…" },
    wbBalance: {
      current: null,
      forWithdraw: null,
      currency: null,
      unavailableReason: "Loading…",
    },
  };
}

async function buildOverviewMetricsFromRaw(
  scope: ScopedDateRange,
  raw: ScopedDashboardRaw,
  options?: { skipSettlement?: boolean }
): Promise<OverviewMetrics> {
  const latestCostByProductId = buildLatestCostByProductId(raw.costHistory, raw.products);
  const salesMetrics = aggregateSalesMetrics(raw.sales);
  const productCost = computeProductCost(raw.sales, raw.costHistory, latestCostByProductId);
  const financeTotals = rollupCategoriesToProfitBuckets(raw.finance);
  const advertising = raw.ads.reduce((sum, ad) => sum + ad.spend, 0);
  const commission = financeTotals.commission;
  const logistics = financeTotals.logistics;
  const returnLogistics = financeTotals.return_logistics;
  const storage = financeTotals.storage;
  const penalties = financeTotals.penalty;
  const otherExpenses = financeTotals.other + financeTotals.unclassified;
  const dailyRevenue = groupSalesByDate(raw.sales, raw.costHistory, latestCostByProductId);
  const ordersPurchasesBase = buildOrdersPurchasesKpis(raw.orders, raw.sales);
  const ordersValueResolution = await resolveOrdersValue(scope, raw.orders);
  const ordersPurchases = {
    ...ordersPurchasesBase,
    ordersValue: ordersValueResolution.ordersValue,
  };
  const totalLogistics = logistics + returnLogistics;
  const netSalesResolution = await resolveNetSales(scope, raw.sales);
  const categorySummary = summarizeFinanceByCategory(raw.finance);
  const salesForPay = buildNetForPayFromDb(raw.sales);
  const marketplaceFeesPresentation = buildMarketplaceFeesPresentation(
    raw.finance,
    commission,
    netSalesResolution.netSales,
    salesForPay
  );
  const costBreakdown = buildCostBreakdown({
    productCost,
    marketplaceFees: marketplaceFeesPresentation.salesToSettlementDifference,
    logistics,
    returnLogistics,
    storage,
    advertising,
    penalties,
  });
  const financeNetForPay = sumNetForPayFromFinance(raw.finance);
  const acceptance = sumAcceptanceFromFinance(raw.finance);
  const customerPaid = buildNetFinishedPriceFromDb(raw.sales);
  let dashboardTax: {
    taxPercent: number;
    taxObject?: ModelBProfitMetrics["taxObject"];
    taxCalculationStatus: NonNullable<ModelBProfitMetrics["taxCalculationStatus"]>;
    taxBase?: number;
    taxDeductibleExpenses?: number;
    estimatedTaxOverride?: number;
  } = { taxPercent: 6, taxCalculationStatus: "PROFILE_MISSING" };
  try {
    const foundation = await getDashboardTaxInputs(scope.companyId, scope.from, scope.to);
    const profile = foundation.profile;
    if (profile) {
      const deductibleExpenses = foundation.recognizedExpensesKopeks / 100;
      const calculation = calculateTaxYtd({
        profile,
        // Dashboard reporting already uses persisted Sales API finishedPrice as its
        // explicit estimated-tax income source. The Tax workspace keeps its stricter
        // statutory evidence gate; this estimate is labelled separately in the UI.
        income: {
          status: "VERIFIED",
          amountKopeks: Math.round(Math.max(0, customerPaid) * 100),
          sourceVersion: "DASHBOARD_FINISHED_PRICE_V1",
        },
        deductibleExpensesKopeks: foundation.recognizedExpensesKopeks,
        // The estimate uses only recognized expenses. Pending/review rows remain
        // excluded, exactly as in the Tax workspace, rather than blocking the
        // entire Dashboard estimate.
        expensesReady: true,
        isFinalAnnualPeriod: false,
      });
      dashboardTax = {
        taxPercent: profile.tax_rate,
        taxObject: profile.tax_object,
        taxCalculationStatus: calculation.estimatedTaxYtdKopeks === null
          ? "SOURCE_UNAVAILABLE" : "READY",
        taxBase: calculation.taxBaseKopeks == null ? undefined : calculation.taxBaseKopeks / 100,
        taxDeductibleExpenses: deductibleExpenses,
        estimatedTaxOverride: calculation.estimatedTaxYtdKopeks == null
          ? undefined : calculation.estimatedTaxYtdKopeks / 100,
      };
    }
  } catch {
    dashboardTax = { taxPercent: 6, taxCalculationStatus: "SOURCE_UNAVAILABLE" };
  }
  const modelBProfit = measureSync("model_b.calculateModelBNetProfit", "model_b", () =>
    buildModelBProfitMetrics(netSalesResolution, {
      salesForPay,
      financeNetForPay,
      acquiring: categorySummary.ACQUIRING,
      logistics: totalLogistics,
      storage,
      penalties,
      adjustments: marketplaceFeesPresentation.accountAdjustments,
      acceptance,
      productCost,
      advertising,
      customerPaid,
      ...dashboardTax,
    })
  );

  const wbSettlement = options?.skipSettlement
    ? LOADING_SETTLEMENT
    : await getWbSettlementMetrics(scope, raw.finance, totalLogistics, raw.salesReports);

  const settlementAvailable = wbSettlement.availability?.available !== false;
  const modelCProfit = settlementAvailable
    ? buildModelCProfitMetrics({
        netForPay: wbSettlement.netForPay,
        marketplaceFees: marketplaceFeesPresentation.marketplaceFees,
        logistics: totalLogistics,
        storage: wbSettlement.storage,
        penalties: wbSettlement.penalties,
        deductions: wbSettlement.deductions,
        acceptance: wbSettlement.acceptance,
        productCost,
        advertising,
      })
    : {
        revenue: 0,
        marketplaceFees: 0,
        logistics: 0,
        storage: 0,
        penalties: 0,
        deductions: 0,
        acceptance: 0,
        productCost: 0,
        advertising: 0,
        netProfit: 0,
      };
  const quantityMetrics = {
    unitsSold: salesMetrics.unitsSold,
    unitsReturned: salesMetrics.unitsReturned,
    netUnits: salesMetrics.unitsSold - salesMetrics.unitsReturned,
    returnedValue: sumReturnedFinishedPriceFromDb(raw.sales),
  };

  logScopeAudit("Dashboard", scope, scope, {
    orders: raw.orders.length,
    sales: raw.sales.length,
    finance: raw.finance.length,
    ads: raw.ads.length,
  });

  return {
    /** Commercial Performance Revenue = Finance ppvz_for_pay. */
    revenue: modelBProfit.revenue,
    productCost,
    /** Finance commission component; broad fees live in marketplaceFeesPresentation. */
    commission: marketplaceFeesPresentation.commission,
    logistics,
    returnLogistics,
    storage,
    advertising,
    penalties,
    otherExpenses,
    /** Net Profit after tax (V4). */
    netProfit: modelBProfit.finalNetProfit,
    returnRate: salesMetrics.returnRate,
    unitsSold: salesMetrics.unitsSold,
    unitsReturned: salesMetrics.unitsReturned,
    dailyRevenue,
    costBreakdown,
    ordersPurchases,
    marketplaceFeesPresentation,
    modelBProfit,
    modelCProfit,
    wbSettlement,
    quantityMetrics,
    cashReceived: raw.cashReceived,
    expectedWbPayout: raw.expectedWbPayout,
    wbBalance: raw.wbBalance,
  };
}

/**
 * Core dashboard payload from SQL only (Model B + charts). No WB API wait.
 * Bounded so a slow database response cannot leave the RSC stream incomplete.
 */
export async function getDashboardCoreData(scope: ScopedDateRange): Promise<DashboardPayload> {
  try {
    const request = () => Promise.resolve(runWithPerfRequest("/", async () =>
      measureAsync(
        "server.getDashboardCoreData",
        "server",
        async () => {
        const env = getSupabaseEnv();
        if (!env.isConfigured) {
          return getSampleDashboard(
            "Supabase is not configured. Copy .env.example to .env.local and add your credentials."
          );
        }

        try {
          const client = await createServerClient();
          const [sql, lastSyncAt] = await Promise.all([
            measureAsync("server.fetchScopedDashboardSql", "server", () => loadSqlForScope(scope)),
            fetchAccountLastSync(client, scope.marketplaceAccountId),
          ]);

          const raw = buildSqlOnlyRaw(sql);

          const overview = await buildOverviewMetricsFromRaw(scope, raw, {
            skipSettlement: true,
          });

          const products = buildProductProfitabilityRows({
            products: sql.products,
            orders: sql.orders,
            sales: sql.sales,
            finance: sql.finance,
            ads: sql.ads,
            costHistory: sql.costHistory,
          });
          const { categories, brands } = buildGroupedViews(products, overview.modelBProfit);

          const hasActivity = hasDashboardActivity(sql);

          if (!hasActivity) {
            return getEmptyPeriodDashboard(lastSyncAt);
          }

          return {
            overview,
            products,
            categories,
            brands,
            isSampleData: false,
            lastSyncAt,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to connect to Supabase";
          console.error("[dashboard] live data unavailable", message);
          throw error;
        }
      },
        { account: scope.marketplaceAccountId, from: scope.from, to: scope.to }
      )
    ));
    // Leave enough time for large tenants while still returning a controlled
    // fallback before the hosting function's hard execution ceiling.
    return await withReadBudget(request, 45_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dashboard request timed out";
    console.error("[dashboard] core data unavailable", message);
    throw error;
  }
}

export type DashboardWbStripPayload = {
  ordersValue: number;
  expectedWbPayout: ExpectedWbPayoutMetrics;
  wbBalance: WbBalanceMetrics;
  wbSettlement: WbSettlementMetrics;
};

/**
 * Keep an optional streamed dashboard segment from holding the complete RSC
 * response open until the hosting platform closes it. A closed response with
 * a pending React chunk surfaces in the browser as the fatal
 * "Connection closed" client exception.
 */
export const DASHBOARD_WB_STRIP_DEADLINE_MS = 5_000;

/** Deferred warehouse KPI strip — shares SQL via react.cache. No marketplace HTTP. */
export const getDashboardWbStripData = cache(
  async (scopeKey: string, scopeJson: string): Promise<DashboardWbStripPayload | null> => {
    const scope = JSON.parse(scopeJson) as ScopedDateRange;
    return measureAsync("server.getDashboardWbStripData", "server", async () => {
      const env = getSupabaseEnv();
      if (!env.isConfigured) return null;

      try {
        await createServerClient();

        // Isolate the optional budget from the SQL promise shared with Core.
        // Starting a cached SQL query under this shorter budget could cancel
        // the main dashboard when only the optional snapshots timed out.
        const [salesReports, wbBalance] = await withReadBudget(
          () => Promise.all([
            loadWbWeeklySalesReports(scope),
            getWbBalanceMetrics(scope.marketplaceAccountId),
          ]),
          DASHBOARD_WB_STRIP_DEADLINE_MS
        );
        const sql = await loadSqlForScope(scope);

        const expectedWbPayout = buildExpectedWbPayoutMetricsFromReports(scope, salesReports);
        const ordersValueResolution = await resolveOrdersValue(scope, sql.orders);
        const financeTotals = rollupCategoriesToProfitBuckets(sql.finance);
        const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
        const wbSettlement = await getWbSettlementMetrics(
          scope,
          sql.finance,
          totalLogistics,
          salesReports
        );

        return {
          ordersValue: ordersValueResolution.ordersValue,
          expectedWbPayout,
          wbBalance,
          wbSettlement,
        };
      } catch {
        return null;
      }
    });
  }
);

export async function loadDashboardWbStrip(
  scope: ScopedDateRange
): Promise<DashboardWbStripPayload | null> {
  const key = `${scope.marketplaceAccountId}:${scope.companyId}:${scope.from}:${scope.to}:${scope.brandId ?? ""}`;
  return getDashboardWbStripData(key, JSON.stringify(scope));
}

export async function getOverviewMetrics(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<OverviewMetrics> {
  const raw = await fetchScopedDashboardRaw(scope, client);
  return buildOverviewMetricsFromRaw(scope, raw);
}

export async function getProductProfitability(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<ProductProfitability[]> {
  const build = await getProductProfitabilityBuild(scope, client);
  return build.rows;
}

export async function getProductProfitabilityBuild(
  scope: ScopedDateRange,
  client?: SupabaseClient
) {
  // SQL only — product profitability does not need live WB API enrichment.
  const sql = await loadSqlForScope(scope, client);

  return buildProductProfitabilityResult({
    products: sql.products,
    orders: sql.orders,
    sales: sql.sales,
    finance: sql.finance,
    ads: sql.ads,
    costHistory: sql.costHistory,
  });
}

export async function getCategoryProfitability(
  scope: ScopedDateRange,
  client?: SupabaseClient
): Promise<CategoryProfitability[]> {
  const sql = await loadSqlForScope(scope, client);
  const products = buildProductProfitabilityRows({
    products: sql.products,
    orders: sql.orders,
    sales: sql.sales,
    finance: sql.finance,
    ads: sql.ads,
    costHistory: sql.costHistory,
  });
  const overview = await buildOverviewMetricsFromRaw(scope, buildSqlOnlyRaw(sql), {
    skipSettlement: true,
  });
  return buildGroupedViews(products, overview.modelBProfit).categories.map(toLegacyCategory);
}

/**
 * Products/Categories pages — SQL only (no WB APIs / settlement / overview).
 * Product/category math builders unchanged.
 */
export async function getDashboardListData(scope: ScopedDateRange): Promise<{
  products: ProductProfitability[];
  categories: GroupedProfitability[];
  brands: GroupedProfitability[];
  isSampleData: boolean;
  message?: string;
  lastSyncAt?: string | null;
}> {
  return measureAsync("server.getDashboardListData", "server", async () => {
    const env = getSupabaseEnv();
    if (!env.isConfigured) {
      const sample = getSampleDashboard(
        "Supabase is not configured. Copy .env.example to .env.local and add your credentials."
      );
      return {
        products: sample.products,
        categories: sample.categories,
        brands: sample.brands,
        isSampleData: true,
        message: sample.message,
      };
    }

    try {
      const client = await createServerClient();
      if (await isDatabaseEmpty(client, scope.marketplaceAccountId)) {
        const sample = getSampleDashboard(
          "Database tables are empty. Showing sample data until Wildberries data is synced."
        );
        return {
          products: sample.products,
          categories: sample.categories,
          brands: sample.brands,
          isSampleData: true,
          message: sample.message,
        };
      }

      const sql = await loadSqlForScope(scope);
      const products = buildProductProfitabilityRows({
        products: sql.products,
        orders: sql.orders,
        sales: sql.sales,
        finance: sql.finance,
        ads: sql.ads,
        costHistory: sql.costHistory,
      });
      const overview = await buildOverviewMetricsFromRaw(scope, buildSqlOnlyRaw(sql), {
        skipSettlement: true,
      });
      const { categories, brands } = buildGroupedViews(products, overview.modelBProfit);
      const lastSyncAt = await fetchAccountLastSync(client, scope.marketplaceAccountId);

      return {
        products,
        categories,
        brands,
        isSampleData: false,
        lastSyncAt,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect to Supabase";
      const sample = getSampleDashboard(
        `Could not load live data: ${message}. Showing sample placeholders.`
      );
      return {
        products: sample.products,
        categories: sample.categories,
        brands: sample.brands,
        isSampleData: true,
        message: sample.message,
      };
    }
  });
}

/**
 * Loads all dashboard data from Supabase.
 * Falls back to sample placeholders when Supabase is not configured or tables are empty.
 */
export async function getDashboardData(scope: ScopedDateRange): Promise<DashboardPayload> {
  return runWithPerfRequest("/", async () =>
    measureAsync(
      "server.getDashboardData",
      "server",
      async () => {
        const env = getSupabaseEnv();

        if (!env.isConfigured) {
          return getSampleDashboard(
            "Supabase is not configured. Copy .env.example to .env.local and add your credentials."
          );
        }

        try {
          const client = await createServerClient();
          const empty = await measureAsync("server.isDatabaseEmpty", "server", () =>
            isDatabaseEmpty(client, scope.marketplaceAccountId)
          );

          if (empty) {
            return getSampleDashboard(
              "Database tables are empty. Showing sample data until Wildberries data is synced."
            );
          }

          const raw = await measureAsync("server.fetchScopedDashboardRaw", "server", () =>
            fetchScopedDashboardRaw(scope, client)
          );
          const overviewStarted = Date.now();
          const [overview, products] = await Promise.all([
            buildOverviewMetricsFromRaw(scope, raw),
            Promise.resolve(
              buildProductProfitabilityRows({
                products: raw.products,
                orders: raw.orders,
                sales: raw.sales,
                finance: raw.finance,
                ads: raw.ads,
                costHistory: raw.costHistory,
              })
            ),
          ]);
          recordPerfEvent({
            category: "server",
            name: "server.buildOverviewAndProducts",
            durationMs: Date.now() - overviewStarted,
            meta: { products: products.length },
          });
          const { categories, brands } = buildGroupedViews(products, overview.modelBProfit);

          const hasActivity = hasDashboardActivity(raw);

          if (!hasActivity) {
            const lastSyncAt = await fetchAccountLastSync(client, scope.marketplaceAccountId);
            return getEmptyPeriodDashboard(lastSyncAt);
          }

          return {
            overview,
            products,
            categories,
            brands,
            isSampleData: false,
            lastSyncAt: await fetchAccountLastSync(client, scope.marketplaceAccountId),
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to connect to Supabase";

          return getSampleDashboard(
            `Could not load live data: ${message}. Showing sample placeholders.`
          );
        }
      },
      { account: scope.marketplaceAccountId, from: scope.from, to: scope.to }
    )
  );
}
