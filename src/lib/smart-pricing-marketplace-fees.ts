import {
  marketplaceFeeFromSales,
  saleUnitSalesAmount,
  sumSalesAndMarketplaceFee,
} from "@/lib/financial-engine";
import type { WbFinance, WbSale } from "@/types/database";

/** Minimum completed sales for product-level weighted marketplace fees. */
export const SMART_PRICING_MIN_PRODUCT_SALES = 20;

/** Minimum completed sales across a category for category-level weighted marketplace fees. */
export const SMART_PRICING_MIN_CATEGORY_SALES = 50;

export type MarketplaceFeesTotals = {
  /** Marketplace Fee ₽ = max(0, Sales − Sales API forPay). */
  marketplaceFees: number;
  /** Sales (net priceWithDisc) — not V4 Revenue. */
  revenue: number;
  /** Sales API forPay (net). */
  salesForPay: number;
  unitsSold: number;
};

/** Marketplace Fee metrics from Sales API via Financial Engine. */
export function sumSalesApiCommissionMetrics(sales: WbSale[]): MarketplaceFeesTotals {
  const totals = sumSalesAndMarketplaceFee(sales);
  return {
    marketplaceFees: totals.marketplaceFee,
    revenue: totals.netSales,
    salesForPay: totals.salesForPay,
    unitsSold: totals.unitsSold,
  };
}

/** @deprecated Finance COMMISSION is not Marketplace Fee. */
export function sumProductMarketplaceFees(_finance: WbFinance[]): number {
  return 0;
}

export function sumCompletedSalesRevenue(sales: WbSale[]): {
  revenue: number;
  unitsSold: number;
} {
  const metrics = sumSalesApiCommissionMetrics(sales);
  return { revenue: metrics.revenue, unitsSold: metrics.unitsSold };
}

export { saleUnitSalesAmount };

/**
 * Marketplace Fee totals for Smart Pricing — Financial Engine only.
 * Finance argument is ignored.
 */
export function sumProductMarketplaceFeesMetrics(
  sales: WbSale[],
  _finance?: WbFinance[]
): MarketplaceFeesTotals {
  return sumSalesApiCommissionMetrics(sales);
}

/** Weighted Marketplace Fee %: SUM(fee) / SUM(Sales) × 100. */
export function weightedMarketplaceFeesPercent(
  feesTotal: number,
  salesTotal: number
): number | null {
  if (salesTotal <= 0) return null;
  return (feesTotal / salesTotal) * 100;
}

function emptyFeesTotals(): MarketplaceFeesTotals {
  return { marketplaceFees: 0, revenue: 0, salesForPay: 0, unitsSold: 0 };
}

function mergeFeesTotals(
  a: MarketplaceFeesTotals,
  b: MarketplaceFeesTotals
): MarketplaceFeesTotals {
  const revenue = a.revenue + b.revenue;
  const salesForPay = a.salesForPay + b.salesForPay;
  return {
    revenue,
    salesForPay,
    unitsSold: a.unitsSold + b.unitsSold,
    marketplaceFees: marketplaceFeeFromSales(revenue, salesForPay),
  };
}

export function buildCategoryMarketplaceFeesTotals(
  products: { id: string; category_id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  _financeByProductId?: Map<string, WbFinance[]>
): Map<string, MarketplaceFeesTotals> {
  const byCategory = new Map<string, MarketplaceFeesTotals>();

  for (const product of products) {
    const categoryId = String(product.category_id);
    const productId = String(product.id);
    const metrics = sumSalesApiCommissionMetrics(salesByProductId.get(productId) ?? []);
    byCategory.set(
      categoryId,
      mergeFeesTotals(byCategory.get(categoryId) ?? emptyFeesTotals(), metrics)
    );
  }

  return byCategory;
}

export function buildAccountMarketplaceFeesTotals(
  products: { id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  _financeByProductId?: Map<string, WbFinance[]>
): MarketplaceFeesTotals {
  let totals = emptyFeesTotals();

  for (const product of products) {
    const productId = String(product.id);
    totals = mergeFeesTotals(
      totals,
      sumSalesApiCommissionMetrics(salesByProductId.get(productId) ?? [])
    );
  }

  return totals;
}
