import {
  DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE,
} from "@/lib/marketplace-commission";
import {
  SMART_PRICING_MIN_CATEGORY_SALES as MIN_CATEGORY_FEES_SALES,
  SMART_PRICING_MIN_PRODUCT_SALES as MIN_PRODUCT_FEES_SALES,
  weightedMarketplaceFeesPercent,
  type MarketplaceFeesTotals,
} from "@/lib/smart-pricing-marketplace-fees";
import {
  SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES,
  SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES,
  weightedHistoricalLogistics,
  type HistoricalLogisticsTotals,
} from "@/lib/smart-pricing-logistics";
import {
  weightedStoragePerUnit,
  type StorageTotals,
} from "@/lib/smart-pricing-storage";
import type { MarketplaceType } from "@/types/database";

export type SmartPricingHistoricalSource =
  | "PRODUCT_HISTORY"
  | "CATEGORY_HISTORY"
  | "ACCOUNT_HISTORY";

export type HistoricalCostBucket = {
  logistics: HistoricalLogisticsTotals;
  marketplaceFees: MarketplaceFeesTotals;
  storage: StorageTotals;
};

export type ResolvedHistoricalCosts = {
  resolutionSource: SmartPricingHistoricalSource;
  historicalLogistics: number;
  marketplaceFeesPercent: number;
  storagePerUnit: number;
  completedUnits: number;
  productHistoricalLogistics: number | null;
  categoryHistoricalLogistics: number | null;
  accountHistoricalLogistics: number | null;
  productHistoricalMarketplaceFeesPercent: number | null;
  categoryHistoricalMarketplaceFeesPercent: number | null;
  accountHistoricalMarketplaceFeesPercent: number | null;
  productHistoricalStoragePerUnit: number | null;
  categoryHistoricalStoragePerUnit: number | null;
  accountHistoricalStoragePerUnit: number | null;
};

export function resolveAdaptiveHistoricalCosts(params: {
  marketplace: MarketplaceType;
  product: HistoricalCostBucket;
  category: HistoricalCostBucket;
  account: HistoricalCostBucket;
  minProductSales?: number;
  minCategorySales?: number;
}): ResolvedHistoricalCosts {
  const minProductSales =
    params.minProductSales ?? SMART_PRICING_MIN_PRODUCT_LOGISTICS_SALES;
  const minCategorySales =
    params.minCategorySales ?? SMART_PRICING_MIN_CATEGORY_LOGISTICS_SALES;
  const marketplaceFallbackPercent =
    DEFAULT_COMMISSION_PERCENT_BY_MARKETPLACE[params.marketplace] ?? 20;

  const productHistoricalLogistics = weightedHistoricalLogistics(params.product.logistics);
  const categoryHistoricalLogistics = weightedHistoricalLogistics(params.category.logistics);
  const accountHistoricalLogistics = weightedHistoricalLogistics(params.account.logistics);

  const productHistoricalMarketplaceFeesPercent = weightedMarketplaceFeesPercent(
    params.product.marketplaceFees.marketplaceFees,
    params.product.marketplaceFees.revenue
  );
  const categoryHistoricalMarketplaceFeesPercent = weightedMarketplaceFeesPercent(
    params.category.marketplaceFees.marketplaceFees,
    params.category.marketplaceFees.revenue
  );
  const accountHistoricalMarketplaceFeesPercent = weightedMarketplaceFeesPercent(
    params.account.marketplaceFees.marketplaceFees,
    params.account.marketplaceFees.revenue
  );

  const productHistoricalStoragePerUnit = weightedStoragePerUnit(params.product.storage);
  const categoryHistoricalStoragePerUnit = weightedStoragePerUnit(params.category.storage);
  const accountHistoricalStoragePerUnit = weightedStoragePerUnit(params.account.storage);

  if (
    params.product.logistics.unitsSold >= minProductSales &&
    productHistoricalLogistics !== null
  ) {
    return {
      resolutionSource: "PRODUCT_HISTORY",
      historicalLogistics: productHistoricalLogistics,
      marketplaceFeesPercent:
        productHistoricalMarketplaceFeesPercent ?? marketplaceFallbackPercent,
      storagePerUnit: productHistoricalStoragePerUnit ?? 0,
      completedUnits: params.product.logistics.unitsSold,
      productHistoricalLogistics,
      categoryHistoricalLogistics,
      accountHistoricalLogistics,
      productHistoricalMarketplaceFeesPercent,
      categoryHistoricalMarketplaceFeesPercent,
      accountHistoricalMarketplaceFeesPercent,
      productHistoricalStoragePerUnit,
      categoryHistoricalStoragePerUnit,
      accountHistoricalStoragePerUnit,
    };
  }

  if (
    params.category.logistics.unitsSold >= minCategorySales &&
    categoryHistoricalLogistics !== null
  ) {
    return {
      resolutionSource: "CATEGORY_HISTORY",
      historicalLogistics: categoryHistoricalLogistics,
      marketplaceFeesPercent:
        categoryHistoricalMarketplaceFeesPercent ?? marketplaceFallbackPercent,
      storagePerUnit: categoryHistoricalStoragePerUnit ?? 0,
      completedUnits: params.category.logistics.unitsSold,
      productHistoricalLogistics,
      categoryHistoricalLogistics,
      accountHistoricalLogistics,
      productHistoricalMarketplaceFeesPercent,
      categoryHistoricalMarketplaceFeesPercent,
      accountHistoricalMarketplaceFeesPercent,
      productHistoricalStoragePerUnit,
      categoryHistoricalStoragePerUnit,
      accountHistoricalStoragePerUnit,
    };
  }

  return {
    resolutionSource: "ACCOUNT_HISTORY",
    historicalLogistics: accountHistoricalLogistics ?? 0,
    marketplaceFeesPercent:
      accountHistoricalMarketplaceFeesPercent ?? marketplaceFallbackPercent,
    storagePerUnit: accountHistoricalStoragePerUnit ?? 0,
    completedUnits: params.account.logistics.unitsSold,
    productHistoricalLogistics,
    categoryHistoricalLogistics,
    accountHistoricalLogistics,
    productHistoricalMarketplaceFeesPercent,
    categoryHistoricalMarketplaceFeesPercent,
    accountHistoricalMarketplaceFeesPercent,
    productHistoricalStoragePerUnit,
    categoryHistoricalStoragePerUnit,
    accountHistoricalStoragePerUnit,
  };
}

export function formatHistoricalSourceLabel(
  source: SmartPricingHistoricalSource
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

/** @deprecated Use SmartPricingHistoricalSource */
export type SmartPricingLogisticsSource = SmartPricingHistoricalSource;

/** @deprecated Use formatHistoricalSourceLabel */
export function formatLogisticsSourceLabel(source: SmartPricingHistoricalSource): string {
  return formatHistoricalSourceLabel(source);
}

export { MIN_PRODUCT_FEES_SALES, MIN_CATEGORY_FEES_SALES };
