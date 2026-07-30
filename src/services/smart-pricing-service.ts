import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import { aggregateStockByProduct } from "@/lib/inventory-aggregation";
import { buildProductFunnelMetrics } from "@/lib/product-funnel-metrics";
import {
  buildCategoryCommissionTotals,
  sumCompletedSalesMetrics,
} from "@/lib/smart-pricing-commission";
import { resolveAdaptiveHistoricalCosts } from "@/lib/smart-pricing-historical-costs";
import {
  buildAccountLogisticsTotals,
  buildCategoryLogisticsTotals,
  sumProductHistoricalLogisticsMetrics,
  totalHistoricalLogistics,
} from "@/lib/smart-pricing-logistics";
import { finishedPriceRatioFromSales } from "@/lib/financial-engine";
import {
  buildAccountMarketplaceFeesTotals,
  buildCategoryMarketplaceFeesTotals,
  saleUnitSalesAmount,
  sumProductMarketplaceFeesMetrics,
} from "@/lib/smart-pricing-marketplace-fees";
import {
  buildAccountStorageTotals,
  buildCategoryStorageTotals,
  sumProductStorageMetrics,
} from "@/lib/smart-pricing-storage";
import {
  COMMISSION_WINDOW_KEYS,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  filterFinanceByCommissionWindow,
  filterSalesByAspWindow,
  filterSalesByCommissionWindow,
  type CommissionWindowKey,
} from "@/lib/smart-pricing-settings";
import { buildSmartPricingDataScope, aspWindowDateFrom } from "@/lib/smart-pricing-windows";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  type ProductSmartPricingInputs,
} from "@/lib/smart-pricing";
import type {
  HistoricalCostWindowTotals,
  SmartPricingCommissionReplay,
  SmartPricingHistoricalReplay,
} from "@/lib/smart-pricing-types";
import {
  buildPricingHealthSummary,
  buildProductPricingHealthRows,
  type PricingHealthSummary,
  type ProductPricingHealthRow,
} from "@/lib/pricing-health";
import {
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import { getInventoryForAccount } from "@/services/inventory-service";
import { getProductProfitability } from "@/services/dashboard-service";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import type { ScopedDateRange, WbFinance, WbSale } from "@/types/database";
import { logScopeAudit } from "@/lib/scope-audit-log";

export type SmartPricingReport = {
  range: ScopedDateRange;
  targetMarginPercent: number;
  marketingPercent: number;
  inputs: ProductSmartPricingInputs[];
  rows: ProductPricingHealthRow[];
  summary: PricingHealthSummary;
};

function indexByProductId<T extends { product_id: string | null }>(
  rows: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (row.product_id == null) continue;
    const key = String(row.product_id);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

type WindowAggregates = {
  categoryLogistics: Map<CommissionWindowKey, ReturnType<typeof buildCategoryLogisticsTotals>>;
  categoryFees: Map<CommissionWindowKey, ReturnType<typeof buildCategoryMarketplaceFeesTotals>>;
  categoryStorage: Map<CommissionWindowKey, ReturnType<typeof buildCategoryStorageTotals>>;
  accountBuckets: Map<
    CommissionWindowKey,
    {
      logistics: ReturnType<typeof buildAccountLogisticsTotals>;
      marketplaceFees: ReturnType<typeof buildAccountMarketplaceFeesTotals>;
      storage: ReturnType<typeof buildAccountStorageTotals>;
    }
  >;
};

function buildWindowAggregates(
  scope: ScopedDateRange,
  products: { id: string; category_id: string }[],
  sales: WbSale[],
  finance: WbFinance[]
): WindowAggregates {
  const categoryLogistics = new Map<
    CommissionWindowKey,
    ReturnType<typeof buildCategoryLogisticsTotals>
  >();
  const categoryFees = new Map<
    CommissionWindowKey,
    ReturnType<typeof buildCategoryMarketplaceFeesTotals>
  >();
  const categoryStorage = new Map<
    CommissionWindowKey,
    ReturnType<typeof buildCategoryStorageTotals>
  >();
  const accountBuckets = new Map<
    CommissionWindowKey,
    {
      logistics: ReturnType<typeof buildAccountLogisticsTotals>;
      marketplaceFees: ReturnType<typeof buildAccountMarketplaceFeesTotals>;
      storage: ReturnType<typeof buildAccountStorageTotals>;
    }
  >();

  for (const window of COMMISSION_WINDOW_KEYS) {
    const windowSales = filterSalesByCommissionWindow(sales, scope, window);
    const windowFinance = filterFinanceByCommissionWindow(finance, scope, window);
    const salesByProductId = indexByProductId(windowSales);
    const financeByProductId = indexByProductId(windowFinance);

    categoryLogistics.set(
      window,
      buildCategoryLogisticsTotals(products, salesByProductId, financeByProductId)
    );
    categoryFees.set(
      window,
      buildCategoryMarketplaceFeesTotals(products, salesByProductId, financeByProductId)
    );
    categoryStorage.set(
      window,
      buildCategoryStorageTotals(products, salesByProductId, financeByProductId)
    );
    accountBuckets.set(window, {
      logistics: buildAccountLogisticsTotals(products, salesByProductId, financeByProductId),
      marketplaceFees: buildAccountMarketplaceFeesTotals(
        products,
        salesByProductId,
        financeByProductId
      ),
      storage: buildAccountStorageTotals(products, salesByProductId, financeByProductId),
    });
  }

  return { categoryLogistics, categoryFees, categoryStorage, accountBuckets };
}

function buildHistoricalWindowTotals(
  productSales: WbSale[],
  productFinance: WbFinance[],
  categoryId: string,
  aggregates: WindowAggregates,
  window: CommissionWindowKey,
  scope: ScopedDateRange
): HistoricalCostWindowTotals {
  const windowSales = filterSalesByCommissionWindow(productSales, scope, window);
  const windowFinance = filterFinanceByCommissionWindow(productFinance, scope, window);
  const account = aggregates.accountBuckets.get(window);

  return {
    productLogistics: sumProductHistoricalLogisticsMetrics(windowSales, windowFinance),
    categoryLogistics:
      aggregates.categoryLogistics.get(window)?.get(categoryId) ?? {
        outboundLogistics: 0,
        rebillLogistics: 0,
        unitsSold: 0,
      },
    accountLogistics: account?.logistics ?? {
      outboundLogistics: 0,
      rebillLogistics: 0,
      unitsSold: 0,
    },
    productMarketplaceFees: sumProductMarketplaceFeesMetrics(windowSales),
    categoryMarketplaceFees:
      aggregates.categoryFees.get(window)?.get(categoryId) ?? {
        marketplaceFees: 0,
        revenue: 0,
        salesForPay: 0,
        unitsSold: 0,
      },
    accountMarketplaceFees: account?.marketplaceFees ?? {
      marketplaceFees: 0,
      revenue: 0,
      salesForPay: 0,
      unitsSold: 0,
    },
    productStorage: sumProductStorageMetrics(windowSales, windowFinance),
    categoryStorage:
      aggregates.categoryStorage.get(window)?.get(categoryId) ?? {
        storage: 0,
        unitsSold: 0,
      },
    accountStorage: account?.storage ?? { storage: 0, unitsSold: 0 },
  };
}

export async function getSmartPricingInputs(
  scope: ScopedDateRange
): Promise<ProductSmartPricingInputs[] | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  // Sprint 8.1 — pricing lookback is fixed (ending today). Dashboard from/to
  // affect reporting only; keep brand/account/company from page scope.
  const dataScope = buildSmartPricingDataScope(scope);

  // Respect header Brand Filter (same account/brand scope as Dashboard / Reports).
  const products = await fetchProductsWithRelations(dataScope.marketplaceAccountId, client, {
    brandId: dataScope.brandId,
  });
  const productIds = products.map((p) => String(p.id));
  const [costHistory, sales, finance, orders, account, inventoryRows] = await Promise.all([
    fetchCostHistory(dataScope.marketplaceAccountId, client, { productIds }),
    fetchSalesInRange(dataScope, client, { productIds }),
    fetchFinanceInRange(dataScope, client, { productIds }),
    fetchOrdersInRange(dataScope, client, { productIds }),
    getMarketplaceAccountForSync(dataScope.marketplaceAccountId),
    getInventoryForAccount(dataScope.marketplaceAccountId, client),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const stockByProductId = aggregateStockByProduct(inventoryRows);
  const salesByProductId = indexByProductId<WbSale>(sales);
  const financeByProductId = indexByProductId<WbFinance>(finance);
  const ordersByProductId = indexByProductId(orders);
  const aggregates = buildWindowAggregates(dataScope, products, sales, finance);
  const defaultSettings = DEFAULT_SMART_PRICING_COMMISSION_SETTINGS;
  const defaultWindow = defaultSettings.commissionWindow;

  logScopeAudit("Smart Pricing", scope, dataScope, {
    orders: orders.length,
    sales: sales.length,
    finance: finance.length,
    inventory: inventoryRows.length,
  });

  return products
    .map((product) => {
      const productId = String(product.id);
      const categoryId = String(product.category_id);
      const brandId = String(product.brand_id);
      const stock = stockByProductId.get(productId);
      const currentStock = stock?.currentStock ?? 0;
      const productSales = salesByProductId.get(productId) ?? [];
      const productFinance = financeByProductId.get(productId) ?? [];
      const productOrders = ordersByProductId.get(productId) ?? [];

      // Sprint 8.1 — ASP / market comparison from recent window only (14–30d band).
      const aspSales = filterSalesByAspWindow(productSales, dataScope.to);
      const completedAspSales = aspSales.filter((row) => !row.is_return);
      const returnedAspUnits = aspSales
        .filter((row) => row.is_return)
        .reduce((sum, row) => sum + row.quantity, 0);
      const unitsSoldAsp = completedAspSales.reduce((sum, row) => sum + row.quantity, 0);
      const totalUnitsAsp = unitsSoldAsp + returnedAspUnits;
      const revenueAsp = completedAspSales.reduce(
        (sum, row) => sum + saleUnitSalesAmount(row),
        0
      );
      const hasSalesHistory = unitsSoldAsp > 0 && revenueAsp > 0;

      // Cost-window product logistics for display splits (default 90d preferred band).
      const costWindowSales = filterSalesByCommissionWindow(
        productSales,
        dataScope,
        defaultWindow
      );
      const costWindowFinance = filterFinanceByCommissionWindow(
        productFinance,
        dataScope,
        defaultWindow
      );
      const productLogistics = sumProductHistoricalLogisticsMetrics(
        costWindowSales,
        costWindowFinance
      );
      const costWindowUnits = costWindowSales
        .filter((row) => !row.is_return)
        .reduce((sum, row) => sum + row.quantity, 0);
      const unitOutboundLogistics =
        costWindowUnits > 0 ? productLogistics.outboundLogistics / costWindowUnits : 0;
      const unitRebillLogistics =
        costWindowUnits > 0 ? productLogistics.rebillLogistics / costWindowUnits : 0;
      const totalProductLogistics = totalHistoricalLogistics(productLogistics);
      const returnLogisticsPercent =
        totalProductLogistics > 0
          ? (productLogistics.rebillLogistics / totalProductLogistics) * 100
          : 0;

      const defaultWindowTotals = buildHistoricalWindowTotals(
        productSales,
        productFinance,
        categoryId,
        aggregates,
        defaultWindow,
        dataScope
      );

      const resolved = resolveAdaptiveHistoricalCosts({
        marketplace: account.marketplace,
        product: {
          logistics: defaultWindowTotals.productLogistics,
          marketplaceFees: defaultWindowTotals.productMarketplaceFees,
          storage: defaultWindowTotals.productStorage,
        },
        category: {
          logistics: defaultWindowTotals.categoryLogistics,
          marketplaceFees: defaultWindowTotals.categoryMarketplaceFees,
          storage: defaultWindowTotals.categoryStorage,
        },
        account: {
          logistics: defaultWindowTotals.accountLogistics,
          marketplaceFees: defaultWindowTotals.accountMarketplaceFees,
          storage: defaultWindowTotals.accountStorage,
        },
        minProductSales: defaultSettings.minProductSales,
        minCategorySales: defaultSettings.minCategorySales,
      });

      const historicalReplay: SmartPricingHistoricalReplay = {
        marketplace: account.marketplace,
        categoryId,
        byWindow: {} as SmartPricingHistoricalReplay["byWindow"],
      };

      for (const window of COMMISSION_WINDOW_KEYS) {
        historicalReplay.byWindow[window] = buildHistoricalWindowTotals(
          productSales,
          productFinance,
          categoryId,
          aggregates,
          window,
          dataScope
        );
      }

      const commissionReplay: SmartPricingCommissionReplay = {
        marketplace: account.marketplace,
        categoryId,
        byWindow: {} as SmartPricingCommissionReplay["byWindow"],
      };

      for (const window of COMMISSION_WINDOW_KEYS) {
        const wSales = filterSalesByCommissionWindow(productSales, dataScope, window);
        const productTotals = sumCompletedSalesMetrics(wSales);
        commissionReplay.byWindow[window] = {
          productTotals,
          categoryTotals:
            buildCategoryCommissionTotals(
              products,
              indexByProductId(filterSalesByCommissionWindow(sales, dataScope, window))
            ).get(categoryId) ?? {
              commission: 0,
              revenue: 0,
              salesForPay: 0,
              unitsSold: 0,
            },
        };
      }

      // Orders / funnel for table filters — use ASP recent window (not reporting range).
      const aspFrom = aspWindowDateFrom(dataScope.to);
      const aspOrders = productOrders.filter((row) => {
        const date = String(row.order_date ?? "").slice(0, 10);
        if (!date) return false;
        return date >= aspFrom && date <= dataScope.to;
      });
      const funnel = buildProductFunnelMetrics(aspOrders, aspSales);

      const row: ProductSmartPricingInputs = {
        productId,
        supplierArticle: product.supplier_article,
        productName: product.name,
        brandId,
        brandName: product.brand?.name?.trim() || "—",
        categoryId,
        categoryName: product.category?.name?.trim() || "—",
        currentStock,
        purchaseCost: (() => {
          const raw = latestCostByProductId.get(productId);
          return raw !== undefined && Number.isFinite(raw) && raw >= 0 ? raw : null;
        })(),
        resolutionSource: resolved.resolutionSource,
        historicalLogistics: resolved.historicalLogistics,
        effectiveLogistics: resolved.historicalLogistics,
        storagePerUnit: resolved.storagePerUnit,
        unitOutboundLogistics,
        unitRebillLogistics,
        historicalCompletedUnits: resolved.completedUnits,
        productHistoricalLogistics: resolved.productHistoricalLogistics,
        categoryHistoricalLogistics: resolved.categoryHistoricalLogistics,
        accountHistoricalLogistics: resolved.accountHistoricalLogistics,
        productHistoricalStoragePerUnit: resolved.productHistoricalStoragePerUnit,
        categoryHistoricalStoragePerUnit: resolved.categoryHistoricalStoragePerUnit,
        accountHistoricalStoragePerUnit: resolved.accountHistoricalStoragePerUnit,
        marketplaceFeesPercent: resolved.marketplaceFeesPercent,
        commissionPercent: resolved.marketplaceFeesPercent,
        marketplaceFeesSource: resolved.resolutionSource,
        commissionSource: resolved.resolutionSource,
        completedSales: unitsSoldAsp,
        productHistoricalMarketplaceFeesPercent:
          resolved.productHistoricalMarketplaceFeesPercent,
        categoryHistoricalMarketplaceFeesPercent:
          resolved.categoryHistoricalMarketplaceFeesPercent,
        productHistoricalCommissionPercent:
          resolved.productHistoricalMarketplaceFeesPercent,
        categoryHistoricalCommissionPercent:
          resolved.categoryHistoricalMarketplaceFeesPercent,
        marketplaceCommissionPercent: resolved.marketplaceFeesPercent,
        currentAvgPrice: hasSalesHistory ? revenueAsp / unitsSoldAsp : null,
        finishedPriceRatio: finishedPriceRatioFromSales(aspSales) ?? 1,
        hasSalesHistory,
        orders: funnel.orders,
        returnRatePercent: totalUnitsAsp > 0 ? (returnedAspUnits / totalUnitsAsp) * 100 : 0,
        returnLogisticsPercent,
        unitPurchaseLogistics: unitOutboundLogistics,
        unitExcludedLogistics: 0,
        logisticsSource: resolved.resolutionSource,
        logisticsCompletedUnits: resolved.completedUnits,
        productHistoricalEffectiveLogistics: resolved.productHistoricalLogistics,
        categoryHistoricalEffectiveLogistics: resolved.categoryHistoricalLogistics,
        accountHistoricalEffectiveLogistics: resolved.accountHistoricalLogistics,
        excludedLogisticsPercent: 0,
        historicalReplay,
        commissionReplay,
      };

      return row;
    })
    .filter((row) => row.currentStock > 0)
    .sort((a, b) => a.supplierArticle.localeCompare(b.supplierArticle));
}

/** @deprecated Use getSmartPricingInputs — health/scenario data removed in V3 */
export async function getSmartPricingReport(
  scope: ScopedDateRange,
  targetMarginPercent = DEFAULT_TARGET_MARGIN_PERCENT,
  marketingPercent = DEFAULT_MARKETING_PERCENT
): Promise<SmartPricingReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const products = await getProductProfitability(scope, client);
  const rows = buildProductPricingHealthRows(products, targetMarginPercent, marketingPercent);
  const inputs = await getSmartPricingInputs(scope);

  return {
    range: scope,
    targetMarginPercent,
    marketingPercent,
    inputs: inputs ?? [],
    rows,
    summary: buildPricingHealthSummary(rows),
  };
}

export type { ProductPricingHealthRow, PricingHealthSummary };
