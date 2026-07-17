import type { CommissionTotals } from "@/lib/smart-pricing-commission";
import type { SmartPricingHistoricalSource } from "@/lib/smart-pricing-historical-costs";
import type { HistoricalLogisticsTotals } from "@/lib/smart-pricing-logistics";
import type { MarketplaceFeesTotals } from "@/lib/smart-pricing-marketplace-fees";
import type { StorageTotals } from "@/lib/smart-pricing-storage";
import type { MarketplaceType } from "@/types/database";

export type CommissionWindowKey = "30" | "60" | "90" | "180" | "range";

export type CommissionWindowTotals = {
  productTotals: CommissionTotals;
  categoryTotals: CommissionTotals;
};

export type HistoricalCostWindowTotals = {
  productLogistics: HistoricalLogisticsTotals;
  categoryLogistics: HistoricalLogisticsTotals;
  accountLogistics: HistoricalLogisticsTotals;
  productMarketplaceFees: MarketplaceFeesTotals;
  categoryMarketplaceFees: MarketplaceFeesTotals;
  accountMarketplaceFees: MarketplaceFeesTotals;
  productStorage: StorageTotals;
  categoryStorage: StorageTotals;
  accountStorage: StorageTotals;
};

export type SmartPricingCommissionReplay = {
  marketplace: MarketplaceType;
  categoryId: string;
  byWindow: Record<CommissionWindowKey, CommissionWindowTotals>;
};

export type SmartPricingHistoricalReplay = {
  marketplace: MarketplaceType;
  categoryId: string;
  byWindow: Record<CommissionWindowKey, HistoricalCostWindowTotals>;
};

/** Forward-looking inputs for the next-unit Smart Pricing engine. */
export type ProductSmartPricingInputs = {
  productId: string;
  supplierArticle: string;
  productName: string;
  brandId: string;
  brandName: string;
  categoryId: string;
  categoryName: string;
  /** Total warehouse stock (quantity_full) — product is listed when > 0. */
  currentStock: number;
  /** Latest row from product_cost_history — null when missing. */
  purchaseCost: number | null;
  /** Unified adaptive resolution tier for marketplace fees, logistics, and storage. */
  resolutionSource: SmartPricingHistoricalSource;
  /** Resolved per-unit historical logistics (outbound + rebill). */
  historicalLogistics: number;
  /** @deprecated Alias for historicalLogistics — used by solver. */
  effectiveLogistics: number;
  /** Resolved per-unit storage cost. */
  storagePerUnit: number;
  /** Product-level outbound delivery_rub per completed sale. */
  unitOutboundLogistics: number;
  /** Product-level rebill_logistic_cost per completed sale. */
  unitRebillLogistics: number;
  /** Completed units in the bucket used for the historical cost decision. */
  historicalCompletedUnits: number;
  productHistoricalLogistics: number | null;
  categoryHistoricalLogistics: number | null;
  accountHistoricalLogistics: number | null;
  productHistoricalStoragePerUnit: number | null;
  categoryHistoricalStoragePerUnit: number | null;
  accountHistoricalStoragePerUnit: number | null;
  /** Adaptive marketplace fees % used in the pricing formula. */
  marketplaceFeesPercent: number;
  /** @deprecated Alias for marketplaceFeesPercent — column label unchanged in UI. */
  commissionPercent: number;
  marketplaceFeesSource: SmartPricingHistoricalSource;
  /** @deprecated Alias for marketplaceFeesSource */
  commissionSource: SmartPricingHistoricalSource;
  completedSales: number;
  productHistoricalMarketplaceFeesPercent: number | null;
  categoryHistoricalMarketplaceFeesPercent: number | null;
  /** @deprecated Use productHistoricalMarketplaceFeesPercent */
  productHistoricalCommissionPercent: number | null;
  /** @deprecated Use categoryHistoricalMarketplaceFeesPercent */
  categoryHistoricalCommissionPercent: number | null;
  marketplaceCommissionPercent: number;
  /** Historical average selling price for comparison — display only. */
  currentAvgPrice: number | null;
  hasSalesHistory: boolean;
  /** Order volume in period — table filters only. */
  orders: number;
  /** Period return rate — completed vs returned units. */
  returnRatePercent: number;
  /** Rebill logistics as % of total historical logistics at product level. */
  returnLogisticsPercent: number;
  /** @deprecated Purchase-only split no longer used in pricing engine. */
  unitPurchaseLogistics: number;
  /** @deprecated Excluded split no longer used in pricing engine. */
  unitExcludedLogistics: number;
  /** @deprecated Use resolutionSource */
  logisticsSource: SmartPricingHistoricalSource;
  /** @deprecated Use historicalCompletedUnits */
  logisticsCompletedUnits: number;
  /** @deprecated Use productHistoricalLogistics */
  productHistoricalEffectiveLogistics: number | null;
  /** @deprecated Use categoryHistoricalLogistics */
  categoryHistoricalEffectiveLogistics: number | null;
  /** @deprecated Use accountHistoricalLogistics */
  accountHistoricalEffectiveLogistics: number | null;
  /** @deprecated Excluded % not used in pricing engine */
  excludedLogisticsPercent: number;
  /** Precomputed historical totals per window for client settings replay. */
  historicalReplay: SmartPricingHistoricalReplay;
  /** Precomputed commission totals per history window for client settings replay. */
  commissionReplay: SmartPricingCommissionReplay;
};
