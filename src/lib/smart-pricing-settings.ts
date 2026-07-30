import {
  resolveAdaptiveHistoricalCosts,
  type HistoricalCostBucket,
} from "@/lib/smart-pricing-historical-costs";
import type {
  CommissionWindowKey,
  ProductSmartPricingInputs,
} from "@/lib/smart-pricing-types";
import {
  aspWindowDateFrom,
  lookbackDateFrom,
  materializeWindowKeyForFilter,
  resolvePreferredCostWindow,
  SMART_PRICING_COST_WINDOW_DEFAULT,
} from "@/lib/smart-pricing-windows";

export type {
  CommissionWindowKey,
  CommissionWindowTotals,
  SmartPricingCommissionReplay,
} from "@/lib/smart-pricing-types";

export const COMMISSION_WINDOW_OPTIONS: { value: CommissionWindowKey; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "range", label: "Selected range" },
];

export type SmartPricingCommissionSettings = {
  minProductSales: number;
  minCategorySales: number;
  commissionWindow: CommissionWindowKey;
};

/** Sprint 8.1 — default cost window is 90d (preferred band), never dashboard range. */
export const DEFAULT_SMART_PRICING_COMMISSION_SETTINGS: SmartPricingCommissionSettings = {
  minProductSales: 20,
  minCategorySales: 50,
  commissionWindow: SMART_PRICING_COST_WINDOW_DEFAULT,
};

export const COMMISSION_WINDOW_KEYS: CommissionWindowKey[] = ["30", "60", "90", "180", "range"];

export function commissionWindowDateFrom(scopeTo: string, window: CommissionWindowKey): string {
  const material = materializeWindowKeyForFilter(window);
  return lookbackDateFrom(scopeTo, Number(material));
}

export function filterSalesByCommissionWindow<T extends { sale_date: string }>(
  sales: T[],
  scope: { from: string; to: string },
  window: CommissionWindowKey
): T[] {
  const from = commissionWindowDateFrom(scope.to, window);
  return sales.filter((row) => {
    const date = row.sale_date.slice(0, 10);
    return date >= from && date <= scope.to;
  });
}

export function filterFinanceByCommissionWindow<T extends { operation_date: string }>(
  finance: T[],
  scope: { from: string; to: string },
  window: CommissionWindowKey
): T[] {
  const from = commissionWindowDateFrom(scope.to, window);
  return finance.filter((row) => {
    const date = row.operation_date.slice(0, 10);
    return date >= from && date <= scope.to;
  });
}

/** ASP / market comparison — recent window only (Sprint 8.1). */
export function filterSalesByAspWindow<T extends { sale_date: string }>(
  sales: T[],
  scopeTo: string
): T[] {
  const from = aspWindowDateFrom(scopeTo);
  return sales.filter((row) => {
    const date = row.sale_date.slice(0, 10);
    return date >= from && date <= scopeTo;
  });
}

/** Resolve which precomputed cost window to apply for fee / logistics / storage. */
export function resolveCostWindowForSettings(
  input: ProductSmartPricingInputs,
  settings: SmartPricingCommissionSettings
): "60" | "90" | "30" | "180" {
  const preferred = resolvePreferredCostWindow({
    window: settings.commissionWindow,
    productUnits60: input.historicalReplay.byWindow["60"]?.productLogistics.unitsSold ?? 0,
    minProductSales: settings.minProductSales,
  });
  return preferred;
}

function windowBucketFromTotals(
  totals: ProductSmartPricingInputs["historicalReplay"]["byWindow"][CommissionWindowKey]
): {
  product: HistoricalCostBucket;
  category: HistoricalCostBucket;
  account: HistoricalCostBucket;
} {
  return {
    product: {
      logistics: totals.productLogistics,
      marketplaceFees: totals.productMarketplaceFees,
      storage: totals.productStorage,
    },
    category: {
      logistics: totals.categoryLogistics,
      marketplaceFees: totals.categoryMarketplaceFees,
      storage: totals.categoryStorage,
    },
    account: {
      logistics: totals.accountLogistics,
      marketplaceFees: totals.accountMarketplaceFees,
      storage: totals.accountStorage,
    },
  };
}

export function applySmartPricingCommissionSettings(
  input: ProductSmartPricingInputs,
  settings: SmartPricingCommissionSettings
): ProductSmartPricingInputs {
  const costWindow = resolveCostWindowForSettings(input, settings);
  const windowTotals = input.historicalReplay.byWindow[costWindow];
  const buckets = windowBucketFromTotals(windowTotals);
  const resolved = resolveAdaptiveHistoricalCosts({
    marketplace: input.historicalReplay.marketplace,
    product: buckets.product,
    category: buckets.category,
    account: buckets.account,
    minProductSales: settings.minProductSales,
    minCategorySales: settings.minCategorySales,
  });

  return {
    ...input,
    resolutionSource: resolved.resolutionSource,
    historicalLogistics: resolved.historicalLogistics,
    effectiveLogistics: resolved.historicalLogistics,
    storagePerUnit: resolved.storagePerUnit,
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
    productHistoricalMarketplaceFeesPercent:
      resolved.productHistoricalMarketplaceFeesPercent,
    categoryHistoricalMarketplaceFeesPercent:
      resolved.categoryHistoricalMarketplaceFeesPercent,
    productHistoricalCommissionPercent:
      resolved.productHistoricalMarketplaceFeesPercent,
    categoryHistoricalCommissionPercent:
      resolved.categoryHistoricalMarketplaceFeesPercent,
    marketplaceCommissionPercent: resolved.marketplaceFeesPercent,
    logisticsSource: resolved.resolutionSource,
    logisticsCompletedUnits: resolved.completedUnits,
    productHistoricalEffectiveLogistics: resolved.productHistoricalLogistics,
    categoryHistoricalEffectiveLogistics: resolved.categoryHistoricalLogistics,
    accountHistoricalEffectiveLogistics: resolved.accountHistoricalLogistics,
  };
}

export function formatCommissionSourceLabel(
  source: ProductSmartPricingInputs["commissionSource"]
): string {
  switch (source) {
    case "PRODUCT_HISTORY":
      return "SKU";
    case "CATEGORY_HISTORY":
      return "CATEGORY";
    case "ACCOUNT_HISTORY":
      return "ACCOUNT";
    default:
      return source;
  }
}

export function parseSmartPricingCommissionSettings(
  params: Record<string, string | undefined>
): SmartPricingCommissionSettings {
  const minProductSales = Number(params.minProductSales);
  const minCategorySales = Number(params.minCategorySales);
  const window = params.commissionWindow as CommissionWindowKey | undefined;

  return {
    minProductSales:
      Number.isFinite(minProductSales) && minProductSales > 0
        ? Math.round(minProductSales)
        : DEFAULT_SMART_PRICING_COMMISSION_SETTINGS.minProductSales,
    minCategorySales:
      Number.isFinite(minCategorySales) && minCategorySales > 0
        ? Math.round(minCategorySales)
        : DEFAULT_SMART_PRICING_COMMISSION_SETTINGS.minCategorySales,
    commissionWindow:
      window && COMMISSION_WINDOW_KEYS.includes(window)
        ? window
        : DEFAULT_SMART_PRICING_COMMISSION_SETTINGS.commissionWindow,
  };
}
