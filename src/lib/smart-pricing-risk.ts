import type { SmartPricingCommissionSource } from "@/lib/smart-pricing-commission";

export type SmartPricingRiskLevel = "low" | "medium" | "high";

export type SmartPricingRiskFactors = {
  returnRatePercent: number;
  excludedLogisticsPercent: number;
  returnLogisticsPercent: number;
  commissionStabilityPoints: number;
};

export type SmartPricingRiskResult = {
  level: SmartPricingRiskLevel;
  label: string;
  tooltip: string;
  factors: SmartPricingRiskFactors;
};

export const SMART_PRICING_RISK_LABEL: Record<SmartPricingRiskLevel, string> = {
  low: "🟢 Low",
  medium: "🟡 Medium",
  high: "🔴 High",
};

function scoreReturnRate(percent: number): number {
  if (percent > 20) return 2;
  if (percent > 10) return 1;
  return 0;
}

function scoreExcludedLogistics(percent: number): number {
  if (percent > 50) return 2;
  if (percent > 25) return 1;
  return 0;
}

function scoreReturnLogistics(percent: number): number {
  if (percent > 15) return 2;
  if (percent > 8) return 1;
  return 0;
}

function scoreCommissionStability(params: {
  commissionSource: SmartPricingCommissionSource;
  productHistoricalCommissionPercent: number | null;
  categoryHistoricalCommissionPercent: number | null;
  commissionPercent: number;
}): number {
  let points = 0;

  if (params.commissionSource === "MARKETPLACE_DEFAULT") points += 2;
  else if (params.commissionSource === "CATEGORY_HISTORY") points += 1;

  const product = params.productHistoricalCommissionPercent;
  const category = params.categoryHistoricalCommissionPercent;

  if (product !== null && category !== null && Math.abs(product - category) > 5) {
    points += 1;
  }

  if (product !== null && Math.abs(product - params.commissionPercent) > 3) {
    points += 1;
  }

  return Math.min(points, 2);
}

export function computeSmartPricingRisk(params: {
  returnRatePercent: number;
  excludedLogisticsPercent: number;
  returnLogisticsPercent: number;
  commissionSource: SmartPricingCommissionSource;
  productHistoricalCommissionPercent: number | null;
  categoryHistoricalCommissionPercent: number | null;
  commissionPercent: number;
}): SmartPricingRiskResult {
  const commissionStabilityPoints = scoreCommissionStability(params);

  const factors: SmartPricingRiskFactors = {
    returnRatePercent: params.returnRatePercent,
    excludedLogisticsPercent: params.excludedLogisticsPercent,
    returnLogisticsPercent: params.returnLogisticsPercent,
    commissionStabilityPoints,
  };

  const total =
    scoreReturnRate(params.returnRatePercent) +
    scoreExcludedLogistics(params.excludedLogisticsPercent) +
    scoreReturnLogistics(params.returnLogisticsPercent) +
    commissionStabilityPoints;

  const level: SmartPricingRiskLevel =
    total >= 5 ? "high" : total >= 3 ? "medium" : "low";

  const tooltip = [
    "Risk score from period logistics and commission confidence.",
    `Return rate: ${params.returnRatePercent.toFixed(1)}%`,
    `Excluded logistics: ${params.excludedLogisticsPercent.toFixed(1)}% of outbound`,
    `Return logistics: ${params.returnLogisticsPercent.toFixed(1)}% of total logistics`,
    `Commission source: ${params.commissionSource}`,
    commissionStabilityPoints > 0
      ? "Commission stability: limited product history or source fallback"
      : "Commission stability: strong product-level history",
  ].join("\n");

  return {
    level,
    label: SMART_PRICING_RISK_LABEL[level],
    tooltip,
    factors,
  };
}
