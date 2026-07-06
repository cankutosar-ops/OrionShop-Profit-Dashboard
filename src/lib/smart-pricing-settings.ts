import type { CommissionTotals } from "@/lib/smart-pricing-commission";
import {
  resolveAdaptiveCommission,
  SMART_PRICING_MIN_CATEGORY_SALES,
  SMART_PRICING_MIN_PRODUCT_SALES,
  type AdaptiveCommissionResult,
  type SmartPricingCommissionSource,
} from "@/lib/smart-pricing-commission";
import type { MarketplaceType, WbFinance, WbSale } from "@/types/database";
import type { ProductSmartPricingInputs } from "@/lib/smart-pricing";

export type CommissionWindowKey = "30" | "60" | "90" | "180" | "range";

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

export const DEFAULT_SMART_PRICING_COMMISSION_SETTINGS: SmartPricingCommissionSettings = {
  minProductSales: SMART_PRICING_MIN_PRODUCT_SALES,
  minCategorySales: SMART_PRICING_MIN_CATEGORY_SALES,
  commissionWindow: "range",
};

export const COMMISSION_WINDOW_KEYS: CommissionWindowKey[] = ["30", "60", "90", "180", "range"];

export type CommissionWindowTotals = {
  productTotals: CommissionTotals;
  categoryTotals: CommissionTotals;
};

export type SmartPricingCommissionReplay = {
  marketplace: MarketplaceType;
  categoryId: string;
  byWindow: Record<CommissionWindowKey, CommissionWindowTotals>;
};

export function commissionWindowDateFrom(scopeTo: string, window: CommissionWindowKey): string {
  if (window === "range") return scopeTo;
  const end = new Date(scopeTo);
  const start = new Date(end);
  start.setDate(start.getDate() - (Number(window) - 1));
  return start.toISOString().slice(0, 10);
}

export function filterSalesByCommissionWindow(
  sales: WbSale[],
  scope: { from: string; to: string },
  window: CommissionWindowKey
): WbSale[] {
  const from =
    window === "range" ? scope.from : commissionWindowDateFrom(scope.to, window);
  return sales.filter((row) => {
    const date = row.sale_date.slice(0, 10);
    return date >= from && date <= scope.to;
  });
}

export function filterFinanceByCommissionWindow(
  finance: WbFinance[],
  scope: { from: string; to: string },
  window: CommissionWindowKey
): WbFinance[] {
  const from =
    window === "range" ? scope.from : commissionWindowDateFrom(scope.to, window);
  return finance.filter((row) => {
    const date = row.operation_date.slice(0, 10);
    return date >= from && date <= scope.to;
  });
}

export function resolveAdaptiveCommissionWithSettings(
  params: {
    marketplace: MarketplaceType;
    categoryId: string;
    productTotals: CommissionTotals;
    categoryTotals: CommissionTotals;
  },
  settings: Pick<SmartPricingCommissionSettings, "minProductSales" | "minCategorySales">
): AdaptiveCommissionResult {
  return resolveAdaptiveCommission({
    ...params,
    minProductSales: settings.minProductSales,
    minCategorySales: settings.minCategorySales,
  });
}

export function applySmartPricingCommissionSettings(
  input: ProductSmartPricingInputs,
  settings: SmartPricingCommissionSettings
): ProductSmartPricingInputs {
  const windowData = input.commissionReplay.byWindow[settings.commissionWindow];
  const adaptive = resolveAdaptiveCommissionWithSettings(
    {
      marketplace: input.commissionReplay.marketplace,
      categoryId: input.commissionReplay.categoryId,
      productTotals: windowData.productTotals,
      categoryTotals: windowData.categoryTotals,
    },
    settings
  );

  return {
    ...input,
    commissionPercent: adaptive.commissionPercent,
    commissionSource: adaptive.commissionSource,
    completedSales: adaptive.completedSales,
    productHistoricalCommissionPercent: adaptive.productHistoricalCommissionPercent,
    categoryHistoricalCommissionPercent: adaptive.categoryHistoricalCommissionPercent,
    marketplaceCommissionPercent: adaptive.marketplaceCommissionPercent,
  };
}

export function formatCommissionSourceLabel(
  source: SmartPricingCommissionSource
): string {
  return source;
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
