import {
  verifyRecommendedPrice,
  type SmartPricingComputedRow,
  type SmartPricingSolverInputs,
} from "@/lib/smart-pricing";

export const NEAR_RECOMMENDED_TOLERANCE_PERCENT = 2;

export type SmartPricingSimulatorComparison =
  | "loss"
  | "below-recommended"
  | "near-recommended"
  | "above-recommended";

export const SIMULATOR_COMPARISON_LABEL: Record<
  SmartPricingSimulatorComparison,
  string
> = {
  loss: "🔴 Loss",
  "below-recommended": "🟡 Below Recommended",
  "near-recommended": "🟢 Near Recommended",
  "above-recommended": "🔵 Above Recommended",
};

export type SmartPricingSimulation = {
  testPrice: number;
  netProfit: number;
  profitMarginPercent: number;
  differenceVsRecommended: number | null;
  comparison: SmartPricingSimulatorComparison;
  comparisonLabel: string;
  isLoss: boolean;
};

export function buildSolverInputsFromRow(
  row: SmartPricingComputedRow
): SmartPricingSolverInputs | null {
  if (row.purchaseCost === null) return null;

  return {
    purchaseCost: row.purchaseCost,
    effectiveLogistics: row.effectiveLogistics,
    commissionPercent: row.commissionPercent,
  };
}

export function resolveTestPrice(
  row: SmartPricingComputedRow,
  override: number | undefined
): number | null {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  return row.targetPrice;
}

export function classifyTestPriceComparison(
  testPrice: number,
  recommendedPrice: number | null,
  isLoss: boolean
): SmartPricingSimulatorComparison {
  if (isLoss) return "loss";
  if (recommendedPrice === null || recommendedPrice <= 0) return "near-recommended";

  const percentDiff = ((testPrice - recommendedPrice) / recommendedPrice) * 100;
  if (Math.abs(percentDiff) <= NEAR_RECOMMENDED_TOLERANCE_PERCENT) {
    return "near-recommended";
  }
  if (testPrice < recommendedPrice) return "below-recommended";
  return "above-recommended";
}

export function computeSmartPricingSimulation(
  row: SmartPricingComputedRow,
  testPrice: number,
  marketingPercent: number
): SmartPricingSimulation | null {
  const solver = buildSolverInputsFromRow(row);
  if (solver === null || !Number.isFinite(testPrice) || testPrice <= 0) return null;

  const { profit, marginPercent } = verifyRecommendedPrice(
    solver,
    0,
    marketingPercent,
    testPrice
  );

  const isLoss = profit < 0;
  const comparison = classifyTestPriceComparison(testPrice, row.targetPrice, isLoss);
  const differenceVsRecommended =
    row.targetPrice !== null ? testPrice - row.targetPrice : null;

  return {
    testPrice,
    netProfit: profit,
    profitMarginPercent: marginPercent,
    differenceVsRecommended,
    comparison,
    comparisonLabel: SIMULATOR_COMPARISON_LABEL[comparison],
    isLoss,
  };
}

export function adjustTestPrice(current: number, percentDelta: number): number {
  return Math.round(current * (1 + percentDelta / 100) * 100) / 100;
}
