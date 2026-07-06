import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  SMART_PRICING_MARGIN_PRESETS,
} from "@/lib/smart-pricing-constants";
import type { SmartPricingCommissionSource } from "@/lib/smart-pricing-commission";
import type { SmartPricingLogisticsSource } from "@/lib/smart-pricing-logistics";
import type { SmartPricingCommissionReplay } from "@/lib/smart-pricing-settings";
import type { SmartPricingRiskLevel } from "@/lib/smart-pricing-risk";
import { computeSmartPricingRisk } from "@/lib/smart-pricing-risk";

export {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  SMART_PRICING_MARGIN_PRESETS,
};

/** Forward-looking inputs for the next-unit Smart Pricing engine. */
export type ProductSmartPricingInputs = {
  productId: string;
  supplierArticle: string;
  productName: string;
  /** Latest row from product_cost_history — null when missing. */
  purchaseCost: number | null;
  /** Average purchase-matched outbound logistics per completed sale. */
  unitPurchaseLogistics: number;
  /** Average excluded outbound logistics per completed sale (cancelled / unmatched). */
  unitExcludedLogistics: number;
  /** Resolved logistics per unit — used in the pricing formula. */
  effectiveLogistics: number;
  logisticsSource: SmartPricingLogisticsSource;
  /** Completed units in the bucket used for the logistics decision. */
  logisticsCompletedUnits: number;
  /** Product-level (purchase + excluded) / units — null when no completed sales. */
  productHistoricalEffectiveLogistics: number | null;
  /** Category-level weighted effective logistics — null when no category sales. */
  categoryHistoricalEffectiveLogistics: number | null;
  /** Account-level weighted effective logistics — null when no account sales. */
  accountHistoricalEffectiveLogistics: number | null;
  /** Adaptive commission % used in the pricing formula. */
  commissionPercent: number;
  commissionSource: SmartPricingCommissionSource;
  completedSales: number;
  /** SUM(commission)/SUM(revenue) for this product — null when no revenue. */
  productHistoricalCommissionPercent: number | null;
  /** SUM(commission)/SUM(revenue) for the category — null when no category revenue. */
  categoryHistoricalCommissionPercent: number | null;
  marketplaceCommissionPercent: number;
  /** Historical average selling price for comparison — display only. */
  currentAvgPrice: number | null;
  hasSalesHistory: boolean;
  /** Order volume in period — table filters only. */
  orders: number;
  /** Period return rate — completed vs returned units. */
  returnRatePercent: number;
  /** Excluded logistics as % of outbound (purchase + excluded). */
  excludedLogisticsPercent: number;
  /** Return logistics as % of total logistics (purchase + excluded + return). */
  returnLogisticsPercent: number;
  /** Precomputed commission totals per history window for client settings replay. */
  commissionReplay: SmartPricingCommissionReplay;
};

export type SmartPricingStatus =
  | "missing-cost"
  | "profitable"
  | "small-increase"
  | "difficult"
  | "unrealistic"
  | "no-data"
  | "infeasible";

export const PRICING_V3_STATUS_LABEL: Record<SmartPricingStatus, string> = {
  "missing-cost": "⚪ Missing Cost",
  profitable: "🟢 Already profitable",
  "small-increase": "🟡 Small increase",
  difficult: "🟠 Difficult",
  unrealistic: "🔴 Unrealistic",
  "no-data": "⚪ No Data",
  infeasible: "🔴 Unrealistic",
};

export type SmartPricingSolverInputs = {
  purchaseCost: number;
  effectiveLogistics: number;
  commissionPercent: number;
};

/**
 * Next-unit target price:
 * P = (PurchaseCost + EffectiveLogistics) / (1 - Commission% - Marketing% - TargetMargin%)
 *
 * EffectiveLogistics = (purchase logistics + excluded logistics) / completed purchases.
 */
export function solveRecommendedPrice(
  inputs: SmartPricingSolverInputs,
  targetMarginPercent: number,
  marketingPercent: number
): number | null {
  const alpha = inputs.commissionPercent / 100;
  const beta = marketingPercent / 100;
  const m = targetMarginPercent / 100;

  const numerator = inputs.purchaseCost + inputs.effectiveLogistics;
  const denominator = 1 - alpha - beta - m;

  if (denominator <= 0) return null;

  const price = numerator / denominator;
  if (!Number.isFinite(price) || price <= 0) return null;

  return price;
}

export function verifyRecommendedPrice(
  inputs: SmartPricingSolverInputs,
  targetMarginPercent: number,
  marketingPercent: number,
  price: number
): { profit: number; marginPercent: number } {
  const alpha = inputs.commissionPercent / 100;
  const beta = marketingPercent / 100;

  const profit =
    price -
    inputs.purchaseCost -
    inputs.effectiveLogistics -
    alpha * price -
    beta * price;

  return {
    profit,
    marginPercent: price > 0 ? (profit / price) * 100 : 0,
  };
}

export function formatRecommendedPriceFormula(
  inputs: SmartPricingSolverInputs,
  targetMarginPercent: number,
  marketingPercent: number
): string {
  const price = solveRecommendedPrice(inputs, targetMarginPercent, marketingPercent);
  const numerator = inputs.purchaseCost + inputs.effectiveLogistics;
  const denominator =
    1 -
    inputs.commissionPercent / 100 -
    marketingPercent / 100 -
    targetMarginPercent / 100;

  return [
    "Recommended Price = (PurchaseCost + EffectiveLogistics) / (1 - Commission% - Marketing% - TargetMargin%)",
    `= (${inputs.purchaseCost.toFixed(2)} + ${inputs.effectiveLogistics.toFixed(2)}) / (1 - ${inputs.commissionPercent}% - ${marketingPercent}% - ${targetMarginPercent}%)`,
    `= ${numerator.toFixed(2)} / ${denominator.toFixed(4)}`,
    price !== null ? `= ${price.toFixed(2)} ₽` : "= —",
  ].join("\n");
}

export function classifySmartPricingStatus(
  differencePercent: number | null,
  hasPurchaseCost: boolean,
  hasSalesHistory: boolean,
  targetPrice: number | null
): SmartPricingStatus {
  if (!hasPurchaseCost) return "missing-cost";
  if (targetPrice === null) return "infeasible";
  if (!hasSalesHistory || differencePercent === null) return "no-data";
  if (differencePercent <= 0) return "profitable";
  if (differencePercent < 10) return "small-increase";
  if (differencePercent < 20) return "difficult";
  return "unrealistic";
}

function buildPriceDiff(
  currentAvgPrice: number | null,
  targetPrice: number | null
): { differenceRub: number | null; differencePercent: number | null } {
  if (targetPrice === null || currentAvgPrice === null || currentAvgPrice <= 0) {
    return { differenceRub: null, differencePercent: null };
  }

  const differenceRub = targetPrice - currentAvgPrice;
  return {
    differenceRub,
    differencePercent: (differenceRub / currentAvgPrice) * 100,
  };
}

function solverInputsFromProduct(
  inputs: ProductSmartPricingInputs
): SmartPricingSolverInputs | null {
  if (inputs.purchaseCost === null) return null;

  return {
    purchaseCost: inputs.purchaseCost,
    effectiveLogistics: inputs.effectiveLogistics,
    commissionPercent: inputs.commissionPercent,
  };
}

export type SmartPricingComputedRow = ProductSmartPricingInputs & {
  priceFor20: number | null;
  priceFor25: number | null;
  priceFor30: number | null;
  priceFor35: number | null;
  targetPrice: number | null;
  differenceRub: number | null;
  differencePercent: number | null;
  status: SmartPricingStatus;
  riskLevel: SmartPricingRiskLevel;
  riskLabel: string;
  riskTooltip: string;
};

export function buildSmartPricingRow(
  inputs: ProductSmartPricingInputs,
  targetMarginPercent: number,
  marketingPercent: number
): SmartPricingComputedRow {
  const solver = solverInputsFromProduct(inputs);
  const hasPurchaseCost = solver !== null;

  const priceFor = (margin: number) =>
    solver ? solveRecommendedPrice(solver, margin, marketingPercent) : null;

  const priceFor20 = priceFor(20);
  const priceFor25 = priceFor(25);
  const priceFor30 = priceFor(30);
  const priceFor35 = priceFor(35);
  const targetPrice = hasPurchaseCost
    ? solveRecommendedPrice(solver, targetMarginPercent, marketingPercent)
    : null;

  const { differenceRub, differencePercent } = buildPriceDiff(
    inputs.currentAvgPrice,
    targetPrice
  );

  const status = classifySmartPricingStatus(
    differencePercent,
    hasPurchaseCost,
    inputs.hasSalesHistory,
    targetPrice
  );

  const risk = computeSmartPricingRisk({
    returnRatePercent: inputs.returnRatePercent,
    excludedLogisticsPercent: inputs.excludedLogisticsPercent,
    returnLogisticsPercent: inputs.returnLogisticsPercent,
    commissionSource: inputs.commissionSource,
    productHistoricalCommissionPercent: inputs.productHistoricalCommissionPercent,
    categoryHistoricalCommissionPercent: inputs.categoryHistoricalCommissionPercent,
    commissionPercent: inputs.commissionPercent,
  });

  return {
    ...inputs,
    priceFor20,
    priceFor25,
    priceFor30,
    priceFor35,
    targetPrice,
    differenceRub,
    differencePercent,
    status,
    riskLevel: risk.level,
    riskLabel: risk.label,
    riskTooltip: risk.tooltip,
  };
}

export function buildSmartPricingRows(
  inputs: ProductSmartPricingInputs[],
  targetMarginPercent: number,
  marketingPercent: number
): SmartPricingComputedRow[] {
  return inputs
    .map((row) => buildSmartPricingRow(row, targetMarginPercent, marketingPercent))
    .sort((a, b) => {
      if (a.purchaseCost !== null && b.purchaseCost === null) return -1;
      if (a.purchaseCost === null && b.purchaseCost !== null) return 1;
      return (b.differencePercent ?? -Infinity) - (a.differencePercent ?? -Infinity);
    });
}
