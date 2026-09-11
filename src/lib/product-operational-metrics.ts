import { calculateNetMarginPercent } from "@/lib/profit-margin";
import type { ProductProfitability } from "@/types/database";

/**
 * Product Total Logistics for Net Profit / Unit Logistics Cost.
 * Eligible purchase-SRID logistics only (excluded is visibility, not NP).
 */
export function calculateTotalLogistics(
  product: Pick<ProductProfitability, "purchaseLogistics" | "excludedLogistics">
): number {
  void product.excludedLogistics;
  return product.purchaseLogistics;
}

/**
 * Storage, penalties, and reimbursements outside Marketplace Fee.
 * Account adjustments are deducted inside V4 Net Profit via `adjustments`.
 */
export function calculateOtherMarketplaceCosts(
  product: Pick<ProductProfitability, "storage" | "penalties" | "reimbursements">
): number {
  return product.storage + product.penalties + product.reimbursements;
}

/**
 * Product Analytics Net Profit (V4 finalNetProfit).
 * Does NOT deduct Marketplace Fee or Acquiring again.
 * Named calculateOperationalProfit for historical call-site compatibility.
 */
export function calculateOperationalProfit(product: ProductProfitability): number {
  return product.finalNetProfit;
}

export function calculateOperationalMarginPercent(
  revenue: number,
  operationalProfit: number
): number {
  return calculateNetMarginPercent(revenue, operationalProfit);
}

export type OperationalMarginBand = "strong" | "healthy" | "weak" | "loss";

/** Status band from operational margin % for row highlighting. */
export function getOperationalMarginBand(marginPercent: number): OperationalMarginBand {
  if (marginPercent >= 20) return "strong";
  if (marginPercent >= 10) return "healthy";
  if (marginPercent >= 0) return "weak";
  return "loss";
}

export type ProductOperationalMetrics = {
  totalLogistics: number;
  purchaseLogistics: number;
  excludedLogistics: number;
  returnLogistics: number;
  marketing: number;
  marketplaceFees: number;
  otherMarketplaceCosts: number;
  operationalProfit: number;
  operationalMarginPercent: number;
  /** Financial Net Profit (V4 engine, after tax). */
  financialNetProfit: number;
  financialMarginPercent: number;
};

export function buildProductOperationalMetrics(
  product: ProductProfitability
): ProductOperationalMetrics {
  const operationalProfit = calculateOperationalProfit(product);
  return {
    totalLogistics: calculateTotalLogistics(product),
    purchaseLogistics: product.purchaseLogistics,
    excludedLogistics: product.excludedLogistics,
    returnLogistics: product.returnLogistics,
    marketing: product.advertising,
    marketplaceFees: product.marketplaceFees,
    otherMarketplaceCosts: calculateOtherMarketplaceCosts(product),
    operationalProfit,
    operationalMarginPercent: calculateOperationalMarginPercent(
      product.revenue,
      operationalProfit
    ),
    financialNetProfit: product.finalNetProfit,
    financialMarginPercent: calculateNetMarginPercent(
      product.revenue,
      product.finalNetProfit
    ),
  };
}
