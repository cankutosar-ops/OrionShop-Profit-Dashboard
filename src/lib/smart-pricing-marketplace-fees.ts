import {
  buildNetForPayFromDb,
  buildNetSalesFromDb,
} from "@/lib/sales-revenue-resolution";
import type { WbFinance, WbSale } from "@/types/database";

/** Minimum completed sales for product-level weighted marketplace fees. */
export const SMART_PRICING_MIN_PRODUCT_SALES = 20;

/** Minimum completed sales across a category for category-level weighted marketplace fees. */
export const SMART_PRICING_MIN_CATEGORY_SALES = 50;

export type MarketplaceFeesTotals = {
  /** Model B commission ₽ = max(0, netSales − salesForPay). */
  marketplaceFees: number;
  /** Model B Sales (net priceWithDisc). */
  revenue: number;
  /** Model B Sales API forPay (net). */
  salesForPay: number;
  unitsSold: number;
};

/**
 * Model B Sales API commission for a sales set.
 * Commission = max(0, priceWithDisc_net − forPay_net)
 * — never finance COMMISSION rows.
 */
export function sumSalesApiCommissionMetrics(sales: WbSale[]): MarketplaceFeesTotals {
  const { netSales } = buildNetSalesFromDb(sales);
  const salesForPay = buildNetForPayFromDb(sales);
  const completed = sales.filter((row) => !row.is_return);
  const unitsSold = completed.reduce((sum, row) => sum + row.quantity, 0);

  return {
    marketplaceFees: Math.max(0, netSales - salesForPay),
    revenue: netSales,
    salesForPay,
    unitsSold,
  };
}

/** @deprecated Use sumSalesApiCommissionMetrics — finance COMMISSION is not Model B. */
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

/** Unit commercial sales amount for fee-weighting (priceWithDisc preferred). */
export function saleUnitSalesAmount(sale: WbSale): number {
  const priceWithDisc = Number(sale.price_with_disc);
  if (Number.isFinite(priceWithDisc) && priceWithDisc > 0) {
    return Math.abs(priceWithDisc) * sale.quantity;
  }
  return Math.abs(Number(sale.revenue ?? 0));
}

/**
 * Model B commission totals for Smart Pricing.
 * Finance argument is ignored — Sales API only.
 */
export function sumProductMarketplaceFeesMetrics(
  sales: WbSale[],
  _finance?: WbFinance[]
): MarketplaceFeesTotals {
  return sumSalesApiCommissionMetrics(sales);
}

/** Weighted Sales API commission %: SUM(commission) / SUM(priceWithDisc) × 100. */
export function weightedMarketplaceFeesPercent(
  feesTotal: number,
  revenueTotal: number
): number | null {
  if (revenueTotal <= 0) return null;
  return (feesTotal / revenueTotal) * 100;
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
    // Recompute on pooled nets so account/category matches Model B clamping.
    marketplaceFees: Math.max(0, revenue - salesForPay),
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
