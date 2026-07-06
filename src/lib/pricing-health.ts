import { isProductAnalyticsV3Candidate } from "@/lib/product-funnel-metrics";
import {
  buildProductHealthScore,
  type HealthScoreConfidence,
  type HealthScoreStatus,
} from "@/lib/product-health-score";
import {
  buildSmartPricingRow,
  buildSmartPricingSummary,
  deriveProductPricingInputs,
  type ProductPricingHistoricalInputs,
  type SmartPricingComputedRow,
  type SmartPricingSummary,
} from "@/lib/smart-pricing-historical";
import type { ProductProfitability } from "@/types/database";

export type ProductPricingHealthRow = SmartPricingComputedRow & {
  healthScore: number;
  healthStatus: HealthScoreStatus;
  healthConfidence: HealthScoreConfidence;
  mainWeakness: string;
  conversionPercent: number;
  operationalMarginPercent: number;
  logisticsRatioPercent: number;
  orders: number;
  recoveryStatus: SmartPricingComputedRow["status"];
};

export type PricingHealthSummary = SmartPricingSummary & {
  averageHealthScore: number;
  excellentCount: number;
  atRiskCount: number;
};

export function buildProductPricingHealthRow(
  product: ProductProfitability,
  cohortMaxOrders: number,
  targetMarginPercent: number,
  marketingPercent: number
): ProductPricingHealthRow {
  const inputs = deriveProductPricingInputs(product);
  const pricing = buildSmartPricingRow(inputs, targetMarginPercent, marketingPercent);
  const health = buildProductHealthScore(product, cohortMaxOrders);

  return {
    ...pricing,
    healthScore: health.score,
    healthStatus: health.status,
    healthConfidence: health.confidence,
    mainWeakness: health.mainWeakness,
    conversionPercent: health.conversionPercent,
    operationalMarginPercent: health.operationalMarginPercent,
    logisticsRatioPercent: health.logisticsRatioPercent,
    orders: health.orders,
    recoveryStatus: pricing.operationalStatus,
  };
}

export function buildProductPricingHealthRows(
  products: ProductProfitability[],
  targetMarginPercent: number,
  marketingPercent: number
): ProductPricingHealthRow[] {
  const candidates = products.filter(isProductAnalyticsV3Candidate);
  const cohortMaxOrders = candidates.reduce((max, product) => Math.max(max, product.orders), 0);

  return candidates
    .map((product) =>
      buildProductPricingHealthRow(product, cohortMaxOrders, targetMarginPercent, marketingPercent)
    )
    .sort((a, b) => b.healthScore - a.healthScore);
}

export function buildPricingHealthSummary(rows: ProductPricingHealthRow[]): PricingHealthSummary {
  const pricing = buildSmartPricingSummary(rows);
  const withHealth = rows.filter((row) => row.orders > 0 || row.hasSalesHistory);

  return {
    ...pricing,
    averageHealthScore:
      withHealth.length > 0
        ? withHealth.reduce((sum, row) => sum + row.healthScore, 0) / withHealth.length
        : 0,
    excellentCount: withHealth.filter(
      (row) => row.healthStatus === "excellent" || row.healthStatus === "good"
    ).length,
    atRiskCount: withHealth.filter(
      (row) => row.healthStatus === "poor" || row.healthStatus === "critical"
    ).length,
  };
}

export function toPricingHistoricalInputs(row: ProductPricingHealthRow): ProductPricingHistoricalInputs {
  return {
    productId: row.productId,
    supplierArticle: row.supplierArticle,
    productName: row.productName,
    unitsSold: row.unitsSold,
    orders: row.orders,
    currentAvgPrice: row.currentAvgPrice,
    currentNetMarginPercent: row.currentNetMarginPercent,
    currentOperationalMarginPercent: row.currentOperationalMarginPercent,
    commissionRate: row.commissionRate,
    unitProductCost: row.unitProductCost,
    unitPurchaseLogistics: row.unitPurchaseLogistics,
    unitTotalLogistics: row.unitTotalLogistics,
    unitReturnLogistics: row.unitReturnLogistics,
    unitOtherDeductions: row.unitOtherDeductions,
    hasSalesHistory: row.hasSalesHistory,
  };
}
