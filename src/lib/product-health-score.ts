import { buildProductOperationalMetrics, calculateTotalLogistics } from "@/lib/product-operational-metrics";
import type { ProductProfitability } from "@/types/database";

export type HealthScoreConfidence = "low" | "medium" | "high";

export type HealthScoreStatus =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "critical";

export type HealthScoreComponent = {
  key: "conversion" | "margin" | "logistics" | "volume";
  label: string;
  score: number;
};

export type ProductHealthScore = {
  score: number;
  status: HealthScoreStatus;
  confidence: HealthScoreConfidence;
  mainWeakness: string;
  components: HealthScoreComponent[];
  conversionPercent: number;
  operationalMarginPercent: number;
  logisticsRatioPercent: number;
  orders: number;
};

export const HEALTH_STATUS_LABEL: Record<HealthScoreStatus, string> = {
  excellent: "Excellent",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  critical: "Critical",
};

export const HEALTH_CONFIDENCE_LABEL: Record<HealthScoreConfidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const CONVERSION_TARGET_PERCENT = 25;
const LOGISTICS_RATIO_GOOD_PERCENT = 15;
const LOGISTICS_RATIO_BAD_PERCENT = 45;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreConversion(conversionPercent: number): number {
  return clamp((conversionPercent / CONVERSION_TARGET_PERCENT) * 100, 0, 100);
}

function scoreOperationalMargin(marginPercent: number): number {
  if (marginPercent >= 20) return 100;
  if (marginPercent >= 0) return 50 + (marginPercent / 20) * 50;
  if (marginPercent >= -20) return 50 + (marginPercent / 20) * 50;
  return 0;
}

/** Lower logistics ÷ revenue ratio scores higher. */
function scoreLogisticsRatio(ratioPercent: number): number {
  if (ratioPercent <= LOGISTICS_RATIO_GOOD_PERCENT) return 100;
  if (ratioPercent >= LOGISTICS_RATIO_BAD_PERCENT) return 0;
  return 100 - ((ratioPercent - LOGISTICS_RATIO_GOOD_PERCENT) / 30) * 100;
}

function scoreOrderVolume(orders: number, cohortMaxOrders: number): number {
  if (orders <= 0) return 0;
  if (cohortMaxOrders <= 0) return 50;
  return clamp((orders / cohortMaxOrders) * 100, 0, 100);
}

function classifyHealthStatus(score: number): HealthScoreStatus {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  if (score >= 30) return "poor";
  return "critical";
}

function classifyConfidence(orders: number, purchases: number): HealthScoreConfidence {
  if (orders < 5 || purchases < 2) return "low";
  if (orders < 30 || purchases < 8) return "medium";
  return "high";
}

function pickMainWeakness(components: HealthScoreComponent[]): string {
  const weakest = [...components].sort((a, b) => a.score - b.score)[0];
  return weakest?.label ?? "—";
}

export function buildProductHealthScore(
  product: ProductProfitability,
  cohortMaxOrders: number
): ProductHealthScore {
  const ops = buildProductOperationalMetrics(product);
  const totalLogistics = calculateTotalLogistics(product);
  const logisticsRatioPercent =
    product.revenue > 0 ? (totalLogistics / product.revenue) * 100 : 100;

  const components: HealthScoreComponent[] = [
    {
      key: "conversion",
      label: "Conversion",
      score: scoreConversion(product.conversionPercent),
    },
    {
      key: "margin",
      label: "Operational Margin",
      score: scoreOperationalMargin(ops.operationalMarginPercent),
    },
    {
      key: "logistics",
      label: "Logistics Burden",
      score: scoreLogisticsRatio(logisticsRatioPercent),
    },
    {
      key: "volume",
      label: "Order Volume",
      score: scoreOrderVolume(product.orders, cohortMaxOrders),
    },
  ];

  const score = Math.round(
    components.reduce((sum, component) => sum + component.score, 0) / components.length
  );

  return {
    score,
    status: classifyHealthStatus(score),
    confidence: classifyConfidence(product.orders, product.purchases),
    mainWeakness: pickMainWeakness(components),
    components,
    conversionPercent: product.conversionPercent,
    operationalMarginPercent: ops.operationalMarginPercent,
    logisticsRatioPercent,
    orders: product.orders,
  };
}

export function buildProductHealthScores(
  products: ProductProfitability[]
): Map<string, ProductHealthScore> {
  const cohortMaxOrders = products.reduce((max, product) => Math.max(max, product.orders), 0);
  const scores = new Map<string, ProductHealthScore>();

  for (const product of products) {
    scores.set(product.productId, buildProductHealthScore(product, cohortMaxOrders));
  }

  return scores;
}
