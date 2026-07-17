import { calculateNetMarginPercent } from "@/lib/profit-margin";
import type { ProductProfitability } from "@/types/database";

/** All outbound logistics rows for the SKU (purchase + excluded). */
export function calculateTotalLogistics(
  product: Pick<ProductProfitability, "purchaseLogistics" | "excludedLogistics">
): number {
  return product.purchaseLogistics + product.excludedLogistics;
}

/**
 * Storage, penalties, and reimbursements outside Marketplace Fees KPI.
 * Account adjustments are included in marketplaceFees.
 */
export function calculateOtherMarketplaceCosts(
  product: Pick<ProductProfitability, "storage" | "penalties" | "reimbursements">
): number {
  return product.storage + product.penalties + product.reimbursements;
}

/**
 * Operational P&L for Product Analytics (decision tool).
 * Uses the same approved Marketplace Fees definition as the Dashboard.
 */
export function calculateOperationalProfit(product: ProductProfitability): number {
  return (
    product.revenue -
    product.productCost -
    product.marketplaceFees -
    calculateTotalLogistics(product) -
    product.returnLogistics -
    product.advertising -
    calculateOtherMarketplaceCosts(product)
  );
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
  /** Financial net profit (Model B engine). */
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
    operationalMarginPercent: calculateOperationalMarginPercent(product.revenue, operationalProfit),
    financialNetProfit: product.netProfit,
    financialMarginPercent: calculateNetMarginPercent(product.revenue, product.netProfit),
  };
}
