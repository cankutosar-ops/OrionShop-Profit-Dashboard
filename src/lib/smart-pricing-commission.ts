import {
  DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE,
} from "@/lib/marketplace-commission";
import type { MarketplaceType, WbFinance, WbSale } from "@/types/database";

/** Minimum completed sales for product-level weighted commission. */
export const SMART_PRICING_MIN_PRODUCT_SALES = 20;

/** Minimum completed sales across a category for category-level weighted commission. */
export const SMART_PRICING_MIN_CATEGORY_SALES = 50;

export type SmartPricingCommissionSource =
  | "PRODUCT_HISTORY"
  | "CATEGORY_HISTORY"
  | "MARKETPLACE_DEFAULT";

export type CommissionTotals = {
  commission: number;
  revenue: number;
  unitsSold: number;
};

export type AdaptiveCommissionResult = {
  commissionPercent: number;
  commissionSource: SmartPricingCommissionSource;
  completedSales: number;
  productHistoricalCommissionPercent: number | null;
  categoryHistoricalCommissionPercent: number | null;
  marketplaceCommissionPercent: number;
};

/** Weighted commission: SUM(commission) / SUM(revenue) × 100 — never average of percentages. */
export function weightedCommissionPercent(
  commissionTotal: number,
  revenueTotal: number
): number | null {
  if (revenueTotal <= 0) return null;
  return (commissionTotal / revenueTotal) * 100;
}

export function sumCompletedSalesMetrics(sales: WbSale[]): CommissionTotals {
  const completed = sales.filter((row) => !row.is_return);
  return {
    commission: 0,
    revenue: completed.reduce((sum, row) => sum + row.revenue, 0),
    unitsSold: completed.reduce((sum, row) => sum + row.quantity, 0),
  };
}

export function sumProductCommission(finance: WbFinance[]): number {
  return finance
    .filter((row) => row.operation_type === "commission")
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

export function buildCategoryCommissionTotals(
  products: { id: string; category_id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): Map<string, CommissionTotals> {
  const byCategory = new Map<string, CommissionTotals>();

  for (const product of products) {
    const categoryId = String(product.category_id);
    const productId = String(product.id);
    const sales = salesByProductId.get(productId) ?? [];
    const finance = financeByProductId.get(productId) ?? [];

    const productMetrics = sumCompletedSalesMetrics(sales);
    productMetrics.commission = sumProductCommission(finance);

    const existing = byCategory.get(categoryId) ?? {
      commission: 0,
      revenue: 0,
      unitsSold: 0,
    };

    byCategory.set(categoryId, {
      commission: existing.commission + productMetrics.commission,
      revenue: existing.revenue + productMetrics.revenue,
      unitsSold: existing.unitsSold + productMetrics.unitsSold,
    });
  }

  return byCategory;
}

export function resolveAdaptiveCommission(params: {
  marketplace: MarketplaceType;
  categoryId: string;
  productTotals: CommissionTotals;
  categoryTotals: CommissionTotals;
  minProductSales?: number;
  minCategorySales?: number;
}): AdaptiveCommissionResult {
  const minProductSales = params.minProductSales ?? SMART_PRICING_MIN_PRODUCT_SALES;
  const minCategorySales = params.minCategorySales ?? SMART_PRICING_MIN_CATEGORY_SALES;
  const marketplaceCommissionPercent =
    DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE[params.marketplace] ?? 20;

  const productHistoricalCommissionPercent = weightedCommissionPercent(
    params.productTotals.commission,
    params.productTotals.revenue
  );

  const categoryHistoricalCommissionPercent = weightedCommissionPercent(
    params.categoryTotals.commission,
    params.categoryTotals.revenue
  );

  if (
    params.productTotals.unitsSold >= minProductSales &&
    productHistoricalCommissionPercent !== null
  ) {
    return {
      commissionPercent: productHistoricalCommissionPercent,
      commissionSource: "PRODUCT_HISTORY",
      completedSales: params.productTotals.unitsSold,
      productHistoricalCommissionPercent,
      categoryHistoricalCommissionPercent,
      marketplaceCommissionPercent,
    };
  }

  if (
    params.categoryTotals.unitsSold >= minCategorySales &&
    categoryHistoricalCommissionPercent !== null
  ) {
    return {
      commissionPercent: categoryHistoricalCommissionPercent,
      commissionSource: "CATEGORY_HISTORY",
      completedSales: params.productTotals.unitsSold,
      productHistoricalCommissionPercent,
      categoryHistoricalCommissionPercent,
      marketplaceCommissionPercent,
    };
  }

  return {
    commissionPercent: marketplaceCommissionPercent,
    commissionSource: "MARKETPLACE_DEFAULT",
    completedSales: params.productTotals.unitsSold,
    productHistoricalCommissionPercent,
    categoryHistoricalCommissionPercent,
    marketplaceCommissionPercent,
  };
}
