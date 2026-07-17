import {
  calculateModelBMarginPercent,
  calculateModelBNetProfit,
} from "@/lib/profit-engine-model-b";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  DEFAULT_TAX_PERCENT,
  SMART_PRICING_MARGIN_PRESETS,
} from "@/lib/smart-pricing-constants";
import type { SmartPricingRiskLevel } from "@/lib/smart-pricing-risk";
import { computeSmartPricingRisk } from "@/lib/smart-pricing-risk";
import type { ProductSmartPricingInputs } from "@/lib/smart-pricing-types";

export {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  DEFAULT_TAX_PERCENT,
  DEFAULT_USD_EXCHANGE_RATE,
  SMART_PRICING_MARGIN_PRESETS,
} from "@/lib/smart-pricing-constants";
export type { ProductSmartPricingInputs } from "@/lib/smart-pricing-types";

export type SmartPricingStatus =
  | "missing-cost"
  | "profitable"
  | "small-increase"
  | "difficult"
  | "unrealistic"
  | "no-data"
  | "infeasible";

export const PRICING_V3_STATUS_LABEL: Record<SmartPricingStatus, string> = {
  "missing-cost": "Missing Product Cost",
  profitable: "🟢 Already profitable",
  "small-increase": "🟡 Small increase",
  difficult: "🟠 Difficult",
  unrealistic: "🔴 Unrealistic",
  "no-data": "⚪ No Data",
  infeasible: "🔴 Unrealistic",
};

export type SmartPricingSolverInputs = {
  purchaseCost: number;
  /** Per-unit historical logistics (outbound + rebill). */
  historicalLogistics: number;
  /** @deprecated Alias for historicalLogistics */
  effectiveLogistics: number;
  storagePerUnit: number;
  marketplaceFeesPercent: number;
  /** @deprecated Alias for marketplaceFeesPercent */
  commissionPercent: number;
};

/**
 * Build Model B unit economics at selling price P (priceWithDisc).
 *
 * Sales = P
 * Commission = α × P
 * forPay = P − Commission
 * Seller Payout S = forPay − Logistics − Storage  (A=Pen=Adj=0 at unit level)
 * Estimated Tax = S × Tax%
 * Operating Profit = S − Product Cost − Marketing
 * Final Net Profit = After Tax Payout − Product Cost − Marketing
 */
export function buildModelBUnitMetrics(
  inputs: SmartPricingSolverInputs,
  marketingPercent: number,
  price: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
) {
  const feeRate = inputs.marketplaceFeesPercent / 100;
  const marketingRate = marketingPercent / 100;
  const commission = Math.max(0, price * feeRate);
  const salesForPay = price - commission;
  const advertising = price * marketingRate;

  return calculateModelBNetProfit({
    grossSales: price,
    returnedSales: 0,
    netSales: price,
    netSalesStatus: "ready",
    salesForPay,
    acquiring: 0,
    logistics: inputs.historicalLogistics,
    storage: inputs.storagePerUnit,
    penalties: 0,
    adjustments: 0,
    productCost: inputs.purchaseCost,
    advertising,
    taxPercent,
  });
}

/** Tax on Seller Payout only — never from selling price, product cost, or marketing. */
export function calculateTaxOnSellerPayout(
  sellerPayout: number,
  taxPercent: number
): number {
  if (!Number.isFinite(sellerPayout) || sellerPayout <= 0) return 0;
  if (!Number.isFinite(taxPercent) || taxPercent <= 0) return 0;
  return sellerPayout * (taxPercent / 100);
}

export type SmartPricingAfterTaxMetrics = {
  /** Model B operating profit (before tax). */
  operatingProfit: number;
  /** Seller Payout after marketplace fees (excl. product cost & marketing). */
  sellerPayout: number;
  /** Estimated Tax = Seller Payout × Tax%. */
  tax: number;
  /** After Tax Payout = Seller Payout − Estimated Tax. */
  afterTaxPayout: number;
  /** Final Net Profit = After Tax Payout − Product Cost − Marketing. */
  finalNetProfit: number;
  /** Final Net Profit / Selling Price. */
  finalMarginPercent: number;
};

/**
 * Final Net Profit = Seller Payout × (1 − Tax%) − Product Cost − Marketing.
 */
export function buildSmartPricingAfterTaxMetrics(
  inputs: SmartPricingSolverInputs,
  marketingPercent: number,
  taxPercent: number,
  price: number
): SmartPricingAfterTaxMetrics {
  const modelB = buildModelBUnitMetrics(
    inputs,
    marketingPercent,
    price,
    taxPercent
  );
  return {
    operatingProfit: modelB.operatingProfit,
    sellerPayout: modelB.sellerPayout,
    tax: modelB.estimatedTax,
    afterTaxPayout: modelB.afterTaxPayout,
    finalNetProfit: modelB.finalNetProfit,
    finalMarginPercent: calculateModelBMarginPercent(price, modelB.finalNetProfit),
  };
}

/**
 * Target price so Final Net Profit / P = target margin (AFTER tax).
 *
 * With S = P(1−α) − L − St and π = S(1−τ) − C − βP:
 * P* = [C + (1−τ)(L+St)] / [(1−τ)(1−α) − β − m]
 */
export function solveRecommendedPrice(
  inputs: SmartPricingSolverInputs,
  targetNetProfitPercent: number,
  marketingPercent: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
): number | null {
  const alpha = inputs.marketplaceFeesPercent / 100;
  const beta = marketingPercent / 100;
  const tau = Math.max(0, taxPercent) / 100;
  const m = targetNetProfitPercent / 100;
  const oneMinusTau = 1 - tau;

  const numerator =
    inputs.purchaseCost +
    oneMinusTau * (inputs.historicalLogistics + inputs.storagePerUnit);
  const denominator = oneMinusTau * (1 - alpha) - beta - m;

  if (denominator <= 0) return null;

  const price = numerator / denominator;
  if (!Number.isFinite(price) || price <= 0) return null;

  return price;
}

/** Verify price: Final Net Profit after tax on Seller Payout. */
export function verifyRecommendedPrice(
  inputs: SmartPricingSolverInputs,
  _targetNetProfitPercent: number,
  marketingPercent: number,
  price: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
): { profit: number; marginPercent: number; operatingProfit: number; tax: number } {
  const metrics = buildSmartPricingAfterTaxMetrics(
    inputs,
    marketingPercent,
    taxPercent,
    price
  );
  return {
    profit: metrics.finalNetProfit,
    marginPercent: metrics.finalMarginPercent,
    operatingProfit: metrics.operatingProfit,
    tax: metrics.tax,
  };
}

export function formatRecommendedPriceFormula(
  inputs: SmartPricingSolverInputs,
  targetNetProfitPercent: number,
  marketingPercent: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
): string {
  const price = solveRecommendedPrice(
    inputs,
    targetNetProfitPercent,
    marketingPercent,
    taxPercent
  );
  const alpha = inputs.marketplaceFeesPercent / 100;
  const beta = marketingPercent / 100;
  const tau = Math.max(0, taxPercent) / 100;
  const m = targetNetProfitPercent / 100;
  const oneMinusTau = 1 - tau;
  const feeSum = inputs.historicalLogistics + inputs.storagePerUnit;
  const numerator = inputs.purchaseCost + oneMinusTau * feeSum;
  const denominator = oneMinusTau * (1 - alpha) - beta - m;

  return [
    "Recommended Price (after tax) = [ProductCost + (1−Tax%)×(Logistics+Storage)] / [(1−Tax%)×(1−Commission%) − Marketing% − TargetMargin%]",
    `Tax = SellerPayout × ${taxPercent}%  (SellerPayout = P×(1−Commission%) − Logistics − Storage)`,
    `= (${inputs.purchaseCost.toFixed(2)} + ${(oneMinusTau * 100).toFixed(2)}%×${feeSum.toFixed(2)}) / (${(oneMinusTau * 100).toFixed(2)}%×(1-${inputs.marketplaceFeesPercent.toFixed(2)}%) − ${marketingPercent}% − ${targetNetProfitPercent}%)`,
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
  if (
    inputs.purchaseCost === null ||
    !Number.isFinite(inputs.purchaseCost) ||
    inputs.purchaseCost < 0
  ) {
    return null;
  }

  return {
    purchaseCost: inputs.purchaseCost,
    historicalLogistics: inputs.historicalLogistics,
    effectiveLogistics: inputs.historicalLogistics,
    storagePerUnit: inputs.storagePerUnit,
    marketplaceFeesPercent: inputs.marketplaceFeesPercent,
    commissionPercent: inputs.marketplaceFeesPercent,
  };
}

export type SmartPricingComputedRow = ProductSmartPricingInputs & {
  priceFor15: number | null;
  priceFor20: number | null;
  targetPrice: number | null;
  /** Final Net Profit after tax at current average selling price (RUB). */
  currentNetProfit: number | null;
  /** Final Margin % = Final Net Profit / currentAvgPrice. */
  currentMarginPercent: number | null;
  /** Markup on cost % = Final Net Profit / purchaseCost. */
  currentMarkupOnCostPercent: number | null;
  /** Tax ₽ at current average selling price. */
  currentTax: number | null;
  differenceRub: number | null;
  differencePercent: number | null;
  status: SmartPricingStatus;
  riskLevel: SmartPricingRiskLevel;
  riskLabel: string;
  riskTooltip: string;
};

export function buildSmartPricingRow(
  inputs: ProductSmartPricingInputs,
  targetNetProfitPercent: number,
  marketingPercent: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
): SmartPricingComputedRow {
  const solver = solverInputsFromProduct(inputs);
  const hasPurchaseCost = solver !== null;

  const priceFor = (margin: number) =>
    solver ? solveRecommendedPrice(solver, margin, marketingPercent, taxPercent) : null;

  const priceFor15 = priceFor(15);
  const priceFor20 = priceFor(20);
  const targetPrice = hasPurchaseCost
    ? solveRecommendedPrice(solver, targetNetProfitPercent, marketingPercent, taxPercent)
    : null;

  let currentNetProfit: number | null = null;
  let currentMarginPercent: number | null = null;
  let currentMarkupOnCostPercent: number | null = null;
  let currentTax: number | null = null;

  if (
    solver &&
    inputs.currentAvgPrice !== null &&
    Number.isFinite(inputs.currentAvgPrice) &&
    inputs.currentAvgPrice > 0
  ) {
    const afterTax = buildSmartPricingAfterTaxMetrics(
      solver,
      marketingPercent,
      taxPercent,
      inputs.currentAvgPrice
    );
    currentNetProfit = afterTax.finalNetProfit;
    currentMarginPercent = afterTax.finalMarginPercent;
    currentTax = afterTax.tax;
    currentMarkupOnCostPercent =
      solver.purchaseCost > 0
        ? (afterTax.finalNetProfit / solver.purchaseCost) * 100
        : null;
  }

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
    productHistoricalCommissionPercent: inputs.productHistoricalMarketplaceFeesPercent,
    categoryHistoricalCommissionPercent: inputs.categoryHistoricalMarketplaceFeesPercent,
    commissionPercent: inputs.marketplaceFeesPercent,
  });

  return {
    ...inputs,
    priceFor15,
    priceFor20,
    targetPrice,
    currentNetProfit,
    currentMarginPercent,
    currentMarkupOnCostPercent,
    currentTax,
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
  targetNetProfitPercent: number,
  marketingPercent: number,
  taxPercent: number = DEFAULT_TAX_PERCENT
): SmartPricingComputedRow[] {
  return inputs.map((row) =>
    buildSmartPricingRow(row, targetNetProfitPercent, marketingPercent, taxPercent)
  );
}
