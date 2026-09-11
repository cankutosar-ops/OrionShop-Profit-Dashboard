/**
 * Commercial Performance — Potential Profit (No Returns).
 *
 * Analytical simulation only. Consumes existing KPI amounts; does not touch
 * the Financial Engine, Revenue, Net Profit, or any accounting path.
 *
 * Scenario: Returned Sales = 0 → start from Gross Sales and apply the same
 * cost structure line items already shown on Commercial Performance.
 */

export type PotentialProfitNoReturnsInput = {
  grossSales: number;
  marketplaceFee: number;
  productCost: number;
  logistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  adjustments: number;
  advertising: number;
  estimatedTax: number;
  /** Existing Net Profit (finalNetProfit) — read-only, for impact delta. */
  currentNetProfit: number;
};

export type PotentialProfitNoReturnsResult = {
  /** Gross Sales − fees/costs − Estimated Tax (returns assumed zero). */
  potentialProfit: number;
  /** potentialProfit / Gross Sales × 100 (0 when Gross Sales ≤ 0). */
  marginPercentOfGrossSales: number;
  /** potentialProfit − currentNetProfit (profit lost to returns when positive). */
  returnProfitImpact: number;
};

/**
 * Isolated no-returns commercial profit simulation.
 * Does not call the Financial Engine.
 */
export function calculatePotentialProfitNoReturns(
  input: PotentialProfitNoReturnsInput
): PotentialProfitNoReturnsResult {
  const marketplaceFee = Number.isFinite(input.marketplaceFee) ? input.marketplaceFee : 0;
  const productCost = Number.isFinite(input.productCost) ? input.productCost : 0;
  const logistics = Number.isFinite(input.logistics) ? input.logistics : 0;
  const storage = Number.isFinite(input.storage) ? input.storage : 0;
  const acceptance = Number.isFinite(input.acceptance) ? input.acceptance : 0;
  const penalties = Number.isFinite(input.penalties) ? input.penalties : 0;
  const adjustments = Number.isFinite(input.adjustments) ? input.adjustments : 0;
  const advertising = Number.isFinite(input.advertising) ? input.advertising : 0;
  const estimatedTax = Number.isFinite(input.estimatedTax) ? input.estimatedTax : 0;
  const grossSales = Number.isFinite(input.grossSales) ? input.grossSales : 0;
  const currentNetProfit = Number.isFinite(input.currentNetProfit)
    ? input.currentNetProfit
    : 0;

  const potentialProfit =
    grossSales -
    marketplaceFee -
    productCost -
    logistics -
    storage -
    acceptance -
    penalties -
    adjustments -
    advertising -
    estimatedTax;

  const marginPercentOfGrossSales =
    grossSales > 0 ? (potentialProfit / grossSales) * 100 : 0;

  const returnProfitImpact = potentialProfit - currentNetProfit;

  return {
    potentialProfit,
    marginPercentOfGrossSales,
    returnProfitImpact,
  };
}
