import { rowMatchesFinanceCategory } from "@/lib/finance-category";
import type { WbFinance, WbSale } from "@/types/database";

/** Minimum completed sales for product-level historical logistics. */
export const SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES = 20;

/** Minimum completed sales across a category for category-level historical logistics. */
export const SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES = 50;

export type SmartPricingLogisticsSource =
  | "PRODUCT_HISTORY"
  | "CATEGORY_HISTORY"
  | "ACCOUNT_HISTORY";

/** All outbound delivery_rub + rebill_logistic_cost for one SKU in a window. */
export type HistoricalLogisticsTotals = {
  outboundLogistics: number;
  rebillLogistics: number;
  unitsSold: number;
};

export type LogisticsTotals = HistoricalLogisticsTotals;

export type AdaptiveLogisticsResult = {
  effectiveLogistics: number;
  logisticsSource: SmartPricingLogisticsSource;
  logisticsCompletedUnits: number;
  productHistoricalEffectiveLogistics: number | null;
  categoryHistoricalEffectiveLogistics: number | null;
  accountHistoricalEffectiveLogistics: number | null;
};

function sumOutboundLogistics(finance: WbFinance[]): number {
  return finance
    .filter((row) => rowMatchesFinanceCategory(row, "LOGISTICS"))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

function sumRebillLogistics(finance: WbFinance[]): number {
  return finance
    .filter((row) => rowMatchesFinanceCategory(row, "RETURN_LOGISTICS"))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

/** Historical logistics = all outbound (delivery_rub) + rebill (rebill_logistic_cost). */
export function sumProductHistoricalLogisticsMetrics(
  sales: WbSale[],
  finance: WbFinance[]
): HistoricalLogisticsTotals {
  const completed = sales.filter((row) => !row.is_return);
  const unitsSold = completed.reduce((sum, row) => sum + row.quantity, 0);

  return {
    outboundLogistics: sumOutboundLogistics(finance),
    rebillLogistics: sumRebillLogistics(finance),
    unitsSold,
  };
}

/** @deprecated Use sumProductHistoricalLogisticsMetrics */
export const sumProductLogisticsMetrics = sumProductHistoricalLogisticsMetrics;

export function totalHistoricalLogistics(totals: HistoricalLogisticsTotals): number {
  return totals.outboundLogistics + totals.rebillLogistics;
}

/** Per-unit historical logistics burden. */
export function weightedHistoricalLogistics(
  totals: HistoricalLogisticsTotals
): number | null {
  if (totals.unitsSold <= 0) return null;
  return totalHistoricalLogistics(totals) / totals.unitsSold;
}

/** @deprecated Use weightedHistoricalLogistics */
export const weightedEffectiveLogistics = weightedHistoricalLogistics;

export function buildCategoryLogisticsTotals(
  products: { id: string; category_id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): Map<string, HistoricalLogisticsTotals> {
  const byCategory = new Map<string, HistoricalLogisticsTotals>();

  for (const product of products) {
    const categoryId = String(product.category_id);
    const productId = String(product.id);
    const metrics = sumProductHistoricalLogisticsMetrics(
      salesByProductId.get(productId) ?? [],
      financeByProductId.get(productId) ?? []
    );

    const existing = byCategory.get(categoryId) ?? {
      outboundLogistics: 0,
      rebillLogistics: 0,
      unitsSold: 0,
    };

    byCategory.set(categoryId, {
      outboundLogistics: existing.outboundLogistics + metrics.outboundLogistics,
      rebillLogistics: existing.rebillLogistics + metrics.rebillLogistics,
      unitsSold: existing.unitsSold + metrics.unitsSold,
    });
  }

  return byCategory;
}

export function buildAccountLogisticsTotals(
  products: { id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): HistoricalLogisticsTotals {
  const totals: HistoricalLogisticsTotals = {
    outboundLogistics: 0,
    rebillLogistics: 0,
    unitsSold: 0,
  };

  for (const product of products) {
    const productId = String(product.id);
    const metrics = sumProductHistoricalLogisticsMetrics(
      salesByProductId.get(productId) ?? [],
      financeByProductId.get(productId) ?? []
    );

    totals.outboundLogistics += metrics.outboundLogistics;
    totals.rebillLogistics += metrics.rebillLogistics;
    totals.unitsSold += metrics.unitsSold;
  }

  return totals;
}

export function resolveAdaptiveLogistics(params: {
  productTotals: HistoricalLogisticsTotals;
  categoryTotals: HistoricalLogisticsTotals;
  accountTotals: HistoricalLogisticsTotals;
  minProductSales?: number;
  minCategorySales?: number;
}): AdaptiveLogisticsResult {
  const minProductSales =
    params.minProductSales ?? SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES;
  const minCategorySales =
    params.minCategorySales ?? SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES;

  const productHistoricalEffectiveLogistics = weightedHistoricalLogistics(
    params.productTotals
  );
  const categoryHistoricalEffectiveLogistics = weightedHistoricalLogistics(
    params.categoryTotals
  );
  const accountHistoricalEffectiveLogistics = weightedHistoricalLogistics(
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
  switch (source) {
    case "PRODUCT_HISTORY":
      return "SKU";
    case "CATEGORY_HISTORY":
      return "CATEGORY";
    case "ACCOUNT_HISTORY":
      return "ACCOUNT";
  }
}
