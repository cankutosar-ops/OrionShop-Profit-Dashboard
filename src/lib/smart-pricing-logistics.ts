import { rowMatchesFinanceCategory } from "@/lib/finance-category";
import {
  attributeProductFinance,
  buildPurchaseSridSet,
} from "@/lib/product-logistics-attribution";
import type { WbFinance, WbSale } from "@/types/database";

/** Minimum completed sales for product-level effective logistics. */
export const SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES = 20;

/** Minimum completed sales across a category for category-level effective logistics. */
export const SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES = 50;

export type SmartPricingLogisticsSource =
  | "PRODUCT_HISTORY"
  | "CATEGORY_HISTORY"
  | "ACCOUNT_HISTORY";

export type LogisticsTotals = {
  purchaseLogistics: number;
  excludedLogistics: number;
  unitsSold: number;
};

export type AdaptiveLogisticsResult = {
  effectiveLogistics: number;
  logisticsSource: SmartPricingLogisticsSource;
  /** Completed units in the bucket used for the logistics decision. */
  logisticsCompletedUnits: number;
  productHistoricalEffectiveLogistics: number | null;
  categoryHistoricalEffectiveLogistics: number | null;
  accountHistoricalEffectiveLogistics: number | null;
};

function sumPurchaseLogistics(finance: WbFinance[]): number {
  return finance
    .filter((row) => rowMatchesFinanceCategory(row, "LOGISTICS"))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

/** Aggregate purchase + excluded outbound logistics and completed units for one product. */
export function sumProductLogisticsMetrics(
  sales: WbSale[],
  finance: WbFinance[]
): LogisticsTotals {
  const completed = sales.filter((row) => !row.is_return);
  const unitsSold = completed.reduce((sum, row) => sum + row.quantity, 0);
  const purchaseSrids = buildPurchaseSridSet(sales);
  const { financeForBreakdown, excludedLogistics } = attributeProductFinance(
    finance,
    purchaseSrids
  );

  return {
    purchaseLogistics: sumPurchaseLogistics(financeForBreakdown),
    excludedLogistics,
    unitsSold,
  };
}

/** Weighted effective logistics: (purchase + excluded) / completed units. */
export function weightedEffectiveLogistics(totals: LogisticsTotals): number | null {
  if (totals.unitsSold <= 0) return null;
  return (totals.purchaseLogistics + totals.excludedLogistics) / totals.unitsSold;
}

export function buildCategoryLogisticsTotals(
  products: { id: string; category_id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): Map<string, LogisticsTotals> {
  const byCategory = new Map<string, LogisticsTotals>();

  for (const product of products) {
    const categoryId = String(product.category_id);
    const productId = String(product.id);
    const metrics = sumProductLogisticsMetrics(
      salesByProductId.get(productId) ?? [],
      financeByProductId.get(productId) ?? []
    );

    const existing = byCategory.get(categoryId) ?? {
      purchaseLogistics: 0,
      excludedLogistics: 0,
      unitsSold: 0,
    };

    byCategory.set(categoryId, {
      purchaseLogistics: existing.purchaseLogistics + metrics.purchaseLogistics,
      excludedLogistics: existing.excludedLogistics + metrics.excludedLogistics,
      unitsSold: existing.unitsSold + metrics.unitsSold,
    });
  }

  return byCategory;
}

export function buildAccountLogisticsTotals(
  products: { id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): LogisticsTotals {
  const totals: LogisticsTotals = {
    purchaseLogistics: 0,
    excludedLogistics: 0,
    unitsSold: 0,
  };

  for (const product of products) {
    const productId = String(product.id);
    const metrics = sumProductLogisticsMetrics(
      salesByProductId.get(productId) ?? [],
      financeByProductId.get(productId) ?? []
    );

    totals.purchaseLogistics += metrics.purchaseLogistics;
    totals.excludedLogistics += metrics.excludedLogistics;
    totals.unitsSold += metrics.unitsSold;
  }

  return totals;
}

export function resolveAdaptiveLogistics(params: {
  productTotals: LogisticsTotals;
  categoryTotals: LogisticsTotals;
  accountTotals: LogisticsTotals;
  minProductSales?: number;
  minCategorySales?: number;
}): AdaptiveLogisticsResult {
  const minProductSales =
    params.minProductSales ?? SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES;
  const minCategorySales =
    params.minCategorySales ?? SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES;

  const productHistoricalEffectiveLogistics = weightedEffectiveLogistics(
    params.productTotals
  );
  const categoryHistoricalEffectiveLogistics = weightedEffectiveLogistics(
    params.categoryTotals
  );
  const accountHistoricalEffectiveLogistics = weightedEffectiveLogistics(
    params.accountTotals
  );

  if (
    params.productTotals.unitsSold >= minProductSales &&
    productHistoricalEffectiveLogistics !== null
  ) {
    return {
      effectiveLogistics: productHistoricalEffectiveLogistics,
      logisticsSource: "PRODUCT_HISTORY",
      logisticsCompletedUnits: params.productTotals.unitsSold,
      productHistoricalEffectiveLogistics,
      categoryHistoricalEffectiveLogistics,
      accountHistoricalEffectiveLogistics,
    };
  }

  if (
    params.categoryTotals.unitsSold >= minCategorySales &&
    categoryHistoricalEffectiveLogistics !== null
  ) {
    return {
      effectiveLogistics: categoryHistoricalEffectiveLogistics,
      logisticsSource: "CATEGORY_HISTORY",
      logisticsCompletedUnits: params.categoryTotals.unitsSold,
      productHistoricalEffectiveLogistics,
      categoryHistoricalEffectiveLogistics,
      accountHistoricalEffectiveLogistics,
    };
  }

  return {
    effectiveLogistics: accountHistoricalEffectiveLogistics ?? 0,
    logisticsSource: "ACCOUNT_HISTORY",
    logisticsCompletedUnits: params.accountTotals.unitsSold,
    productHistoricalEffectiveLogistics,
    categoryHistoricalEffectiveLogistics,
    accountHistoricalEffectiveLogistics,
  };
}

export function formatLogisticsSourceLabel(
  source: SmartPricingLogisticsSource
): string {
  return source;
}
