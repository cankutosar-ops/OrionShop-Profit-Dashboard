import {

  DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE,

} from "@/lib/marketplace-commission";

import { marketplaceFeeFromSales, sumSalesAndMarketplaceFee } from "@/lib/financial-engine";

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

  /** Model B commission ₽ = max(0, netSales − salesForPay). */

  commission: number;

  /** Model B Sales (net priceWithDisc). */

  revenue: number;

  /** Model B Sales API forPay (net). */

  salesForPay: number;

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



/** Weighted commission: SUM(commission) / SUM(priceWithDisc) × 100 — never average of percentages. */

export function weightedCommissionPercent(

  commissionTotal: number,

  revenueTotal: number

): number | null {

  if (revenueTotal <= 0) return null;

  return (commissionTotal / revenueTotal) * 100;

}



/** Model B Sales API commission metrics for a sales set. */

export function sumCompletedSalesMetrics(sales: WbSale[]): CommissionTotals {
  const totals = sumSalesAndMarketplaceFee(sales);
  return {
    commission: totals.marketplaceFee,
    revenue: totals.netSales,
    salesForPay: totals.salesForPay,
    unitsSold: totals.unitsSold,
  };
}



/**

 * Model B commission ₽ from Sales API only.

 * Commission = max(0, priceWithDisc_net − forPay_net)

 */

export function sumProductCommission(sales: WbSale[]): number {

  return sumCompletedSalesMetrics(sales).commission;

}



/** @deprecated Finance COMMISSION is not used in Model B Smart Pricing. */

export function sumProductCommissionFromFinance(_finance: WbFinance[]): number {

  return 0;

}



function emptyCommissionTotals(): CommissionTotals {

  return { commission: 0, revenue: 0, salesForPay: 0, unitsSold: 0 };

}



function mergeCommissionTotals(a: CommissionTotals, b: CommissionTotals): CommissionTotals {

  const revenue = a.revenue + b.revenue;

  const salesForPay = a.salesForPay + b.salesForPay;

  return {

    revenue,

    salesForPay,

    unitsSold: a.unitsSold + b.unitsSold,

    commission: marketplaceFeeFromSales(revenue, salesForPay),

  };

}



export function buildCategoryCommissionTotals(

  products: { id: string; category_id: string }[],

  salesByProductId: Map<string, WbSale[]>,

  _financeByProductId?: Map<string, WbFinance[]>

): Map<string, CommissionTotals> {

  const byCategory = new Map<string, CommissionTotals>();



  for (const product of products) {

    const categoryId = String(product.category_id);

    const productId = String(product.id);

    const productMetrics = sumCompletedSalesMetrics(salesByProductId.get(productId) ?? []);



    byCategory.set(

      categoryId,

      mergeCommissionTotals(byCategory.get(categoryId) ?? emptyCommissionTotals(), productMetrics)

    );

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


