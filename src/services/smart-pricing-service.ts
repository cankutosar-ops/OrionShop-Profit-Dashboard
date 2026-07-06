import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import { isProductAnalyticsV3Candidate } from "@/lib/product-funnel-metrics";
import { buildProductFunnelMetrics } from "@/lib/product-funnel-metrics";
import type { CommissionTotals } from "@/lib/smart-pricing-commission";
import {
  buildCategoryLogisticsTotals,
  buildAccountLogisticsTotals,
  resolveAdaptiveLogistics,
  sumProductLogisticsMetrics,
} from "@/lib/smart-pricing-logistics";
import {
  buildCategoryCommissionTotals,
  resolveAdaptiveCommission,
  sumCompletedSalesMetrics,
  sumProductCommission,
} from "@/lib/smart-pricing-commission";
import {
  COMMISSION_WINDOW_KEYS,
  DEFAULT_SMART_PRICING_COMMISSION_SETTINGS,
  filterFinanceByCommissionWindow,
  filterSalesByCommissionWindow,
  type CommissionWindowKey,
  type SmartPricingCommissionReplay,
} from "@/lib/smart-pricing-settings";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  type ProductSmartPricingInputs,
} from "@/lib/smart-pricing";
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
  getProductProfitability,
} from "@/services/dashboard-service";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import type { ScopedDateRange, WbFinance, WbSale } from "@/types/database";

export type SmartPricingReport = {
  range: ScopedDateRange;
  targetMarginPercent: number;
  marketingPercent: number;
  inputs: ProductSmartPricingInputs[];
  rows: ProductPricingHealthRow[];
  summary: PricingHealthSummary;
};

function sumReturnLogistics(finance: WbFinance[]): number {
  return finance
    .filter((row) => row.operation_type === "return_logistics")
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

function buildCategoryTotalsByWindow(
  scope: ScopedDateRange,
  products: { id: string; category_id: string }[],
  sales: WbSale[],
  finance: WbFinance[]
): Record<CommissionWindowKey, Map<string, CommissionTotals>> {
  const result = {} as Record<CommissionWindowKey, Map<string, CommissionTotals>>;

  for (const window of COMMISSION_WINDOW_KEYS) {
    const windowSales = filterSalesByCommissionWindow(sales, scope, window);
    const windowFinance = filterFinanceByCommissionWindow(finance, scope, window);
    result[window] = buildCategoryCommissionTotals(
      products,
      indexByProductId(windowSales),
      indexByProductId(windowFinance)
    );
  }

  return result;
}

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

export async function getSmartPricingInputs(
  scope: ScopedDateRange
): Promise<ProductSmartPricingInputs[] | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const [products, costHistory, sales, finance, orders, account] = await Promise.all([
    fetchProductsWithRelations(scope.marketplaceAccountId, client),
    fetchCostHistory(scope.marketplaceAccountId, client),
    fetchSalesInRange(scope, client),
    fetchFinanceInRange(scope, client),
    fetchOrdersInRange(scope, client),
    getMarketplaceAccountForSync(scope.marketplaceAccountId),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const salesByProductId = indexByProductId<WbSale>(sales);
  const financeByProductId = indexByProductId<WbFinance>(finance);
  const categoryTotalsByWindow = buildCategoryTotalsByWindow(scope, products, sales, finance);
  const categoryLogisticsTotals = buildCategoryLogisticsTotals(
    products,
    salesByProductId,
    financeByProductId
  );
  const accountLogisticsTotals = buildAccountLogisticsTotals(
    products,
    salesByProductId,
    financeByProductId
  );
  const defaultSettings = DEFAULT_SMART_PRICING_COMMISSION_SETTINGS;

  return products
    .map((product) => {
      const productId = String(product.id);
      const productSales = salesByProductId.get(productId) ?? [];
      const productOrders = orders.filter((row) => String(row.product_id) === productId);
      const productFinance = financeByProductId.get(productId) ?? [];
      const completedSales = productSales.filter((row) => !row.is_return);
      const returnedUnits = productSales
        .filter((row) => row.is_return)
        .reduce((sum, row) => sum + row.quantity, 0);
      const unitsSold = completedSales.reduce((sum, row) => sum + row.quantity, 0);
      const totalUnits = unitsSold + returnedUnits;
      const revenue = completedSales.reduce((sum, row) => sum + row.revenue, 0);
      const hasSalesHistory = unitsSold > 0 && revenue > 0;
      const categoryId = String(product.category_id);

      const productLogisticsTotals = sumProductLogisticsMetrics(productSales, productFinance);
      const purchaseLogisticsTotal = productLogisticsTotals.purchaseLogistics;
      const excludedLogistics = productLogisticsTotals.excludedLogistics;
      const returnLogisticsTotal = sumReturnLogistics(productFinance);
      const unitPurchaseLogistics =
        unitsSold > 0 ? purchaseLogisticsTotal / unitsSold : 0;
      const unitExcludedLogistics = unitsSold > 0 ? excludedLogistics / unitsSold : 0;
      const unitReturnLogistics = unitsSold > 0 ? returnLogisticsTotal / unitsSold : 0;

      const adaptiveLogistics = resolveAdaptiveLogistics({
        productTotals: productLogisticsTotals,
        categoryTotals: categoryLogisticsTotals.get(categoryId) ?? {
          purchaseLogistics: 0,
          excludedLogistics: 0,
          unitsSold: 0,
        },
        accountTotals: accountLogisticsTotals,
      });
      const effectiveLogistics = adaptiveLogistics.effectiveLogistics;

      const outboundPerUnit = unitPurchaseLogistics + unitExcludedLogistics;
      const totalLogisticsPerUnit =
        unitPurchaseLogistics + unitExcludedLogistics + unitReturnLogistics;
      const returnRatePercent = totalUnits > 0 ? (returnedUnits / totalUnits) * 100 : 0;
      const excludedLogisticsPercent =
        outboundPerUnit > 0 ? (unitExcludedLogistics / outboundPerUnit) * 100 : 0;
      const returnLogisticsPercent =
        totalLogisticsPerUnit > 0
          ? (unitReturnLogistics / totalLogisticsPerUnit) * 100
          : 0;

      const byWindow = {} as SmartPricingCommissionReplay["byWindow"];
      for (const window of COMMISSION_WINDOW_KEYS) {
        const windowSales = filterSalesByCommissionWindow(productSales, scope, window);
        const windowFinance = filterFinanceByCommissionWindow(productFinance, scope, window);
        const productTotals = sumCompletedSalesMetrics(windowSales);
        productTotals.commission = sumProductCommission(windowFinance);
        byWindow[window] = {
          productTotals,
          categoryTotals: categoryTotalsByWindow[window].get(categoryId) ?? {
            commission: 0,
            revenue: 0,
            unitsSold: 0,
          },
        };
      }

      const commissionReplay: SmartPricingCommissionReplay = {
        marketplace: account.marketplace,
        categoryId,
        byWindow,
      };

      const defaultWindowData = byWindow[defaultSettings.commissionWindow];
      const adaptive = resolveAdaptiveCommission({
        marketplace: account.marketplace,
        categoryId,
        productTotals: defaultWindowData.productTotals,
        categoryTotals: defaultWindowData.categoryTotals,
        minProductSales: defaultSettings.minProductSales,
        minCategorySales: defaultSettings.minCategorySales,
      });

      const funnel = buildProductFunnelMetrics(productOrders, productSales);

      const row: ProductSmartPricingInputs = {
        productId,
        supplierArticle: product.supplier_article,
        productName: product.name,
        purchaseCost: latestCostByProductId.get(productId) ?? null,
        unitPurchaseLogistics,
        unitExcludedLogistics,
        effectiveLogistics,
        logisticsSource: adaptiveLogistics.logisticsSource,
        logisticsCompletedUnits: adaptiveLogistics.logisticsCompletedUnits,
        productHistoricalEffectiveLogistics:
          adaptiveLogistics.productHistoricalEffectiveLogistics,
        categoryHistoricalEffectiveLogistics:
          adaptiveLogistics.categoryHistoricalEffectiveLogistics,
        accountHistoricalEffectiveLogistics:
          adaptiveLogistics.accountHistoricalEffectiveLogistics,
        commissionPercent: adaptive.commissionPercent,
        commissionSource: adaptive.commissionSource,
        completedSales: adaptive.completedSales,
        productHistoricalCommissionPercent: adaptive.productHistoricalCommissionPercent,
        categoryHistoricalCommissionPercent: adaptive.categoryHistoricalCommissionPercent,
        marketplaceCommissionPercent: adaptive.marketplaceCommissionPercent,
        currentAvgPrice: hasSalesHistory ? revenue / unitsSold : null,
        hasSalesHistory,
        orders: funnel.orders,
        returnRatePercent,
        excludedLogisticsPercent,
        returnLogisticsPercent,
        commissionReplay,
      };

      return { row, funnel };
    })
    .filter(({ row, funnel }) =>
      isProductAnalyticsV3Candidate({
        orders: row.orders,
        purchases: funnel.purchases,
        revenue: row.currentAvgPrice ?? 0,
      })
    )
    .map(({ row }) => row)
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

  const client = createServerClient();
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
