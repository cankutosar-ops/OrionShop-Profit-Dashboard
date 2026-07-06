import {
  HEALTH_STATUS_LABEL,
  buildProductHealthScore,
  type HealthScoreStatus,
} from "@/lib/product-health-score";
import {
  calculateOperationalProfit,
  calculateTotalLogistics,
} from "@/lib/product-operational-metrics";
import {
  PRICING_V3_STATUS_LABEL,
  classifyPricingStatus,
  deriveProductPricingInputs,
  solveOperationalTargetPrice,
  type ProductPricingHistoricalInputs,
  type SmartPricingHistoricalStatus as SmartPricingStatus,
} from "@/lib/smart-pricing-historical";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing-constants";
import type { ProductProfitability } from "@/types/database";

export const EXCELLENT_MARGIN_PERCENT = 20;
export const LOGISTICS_REDUCTION_MAX_PERCENT = 50;
export const MARKETING_SLIDER_MAX_PERCENT = 20;

export type DecisionSimulatorParams = {
  targetMarginPercent: number;
  marketingPercent: number;
};

export type DecisionSimulatorContext = {
  supplierArticle: string;
  productName: string;
  inputs: ProductPricingHistoricalInputs;
  orders: number;
  purchases: number;
  conversionPercent: number;
  totalLogistics: number;
  currentOperationalProfit: number;
  healthScore: number;
  healthStatus: HealthScoreStatus;
  healthStatusLabel: string;
};

export type PriceIncreaseScenario = {
  requiredPrice: number | null;
  differenceRub: number | null;
  differencePercent: number | null;
  difficulty: SmartPricingStatus;
  difficultyLabel: string;
};

export type ConversionScenario = {
  requiredConversionPercent: number | null;
  conversionIncreasePoints: number | null;
  expectedOperationalMarginPercent: number | null;
  expectedPrice: number | null;
  achievable: boolean;
  explanation: string;
};

export type LogisticsSliderScenario = {
  reductionPercent: number;
  adjustedUnitLogistics: number;
  operationalTargetPrice: number | null;
};

export type MarketingSliderScenario = {
  marketingPercent: number;
  operationalTargetPrice: number | null;
};

export type CombinedOptimizationScenario = {
  priceIncreasePercent: number;
  conversionIncreasePercent: number;
  logisticsReductionPercent: number;
  marketingPercent: number;
  resultingMarginPercent: number;
  resultingPrice: number;
  meetsTarget: boolean;
  effortScore: number;
};

export type SensitivityItem = {
  key: string;
  label: string;
  impactPercent: number;
  barWidth: number;
};

export type SensitivityAnalysis = {
  items: SensitivityItem[];
  biggestLever: string;
  largestOpportunity: string;
};

export type RecoveryRecommendation = {
  headline: string;
  detail: string;
  category:
    | "price-only"
    | "conversion-first"
    | "logistics-first"
    | "combined"
    | "already-there"
    | "not-recoverable";
};

export type TimelineStage = {
  key: string;
  label: string;
  marginPercent: number;
  requiredPrice: number | null;
};

export type DecisionSimulatorReport = {
  context: DecisionSimulatorContext;
  params: DecisionSimulatorParams;
  priceScenario: PriceIncreaseScenario;
  conversionScenario: ConversionScenario;
  combinedScenario: CombinedOptimizationScenario | null;
  sensitivity: SensitivityAnalysis;
  recommendation: RecoveryRecommendation;
  timeline: TimelineStage[];
  breakEvenPrice: number | null;
  operationalTargetPrice: number | null;
};

/** Unit total logistics when conversion changes but order volume and TL stay fixed. */
export function unitLogisticsAtConversion(
  totalLogistics: number,
  orders: number,
  conversionPercent: number
): number {
  if (orders <= 0 || conversionPercent <= 0) return Number.POSITIVE_INFINITY;
  const purchases = orders * (conversionPercent / 100);
  return totalLogistics / purchases;
}

export function calculateOperationalMarginAtPrice(
  inputs: Pick<
    ProductPricingHistoricalInputs,
    | "unitProductCost"
    | "unitReturnLogistics"
    | "unitOtherDeductions"
    | "commissionRate"
  >,
  price: number,
  unitTotalLogistics: number,
  marketingPercent: number
): number {
  if (price <= 0) return 0;
  const alpha = inputs.commissionRate;
  const beta = marketingPercent / 100;
  const profit =
    price -
    inputs.unitProductCost -
    alpha * price -
    unitTotalLogistics -
    inputs.unitReturnLogistics -
    beta * price -
    inputs.unitOtherDeductions;
  return (profit / price) * 100;
}

export function buildDecisionSimulatorContext(
  product: ProductProfitability,
  cohortMaxOrders: number
): DecisionSimulatorContext {
  const inputs = deriveProductPricingInputs(product);
  const health = buildProductHealthScore(product, cohortMaxOrders);

  return {
    supplierArticle: product.modelCode,
    productName: product.productName,
    inputs,
    orders: product.orders,
    purchases: product.purchases,
    conversionPercent: product.conversionPercent,
    totalLogistics: calculateTotalLogistics(product),
    currentOperationalProfit: calculateOperationalProfit(product),
    healthScore: health.score,
    healthStatus: health.status,
    healthStatusLabel: HEALTH_STATUS_LABEL[health.status],
  };
}

function buildPriceIncreaseScenario(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams
): PriceIncreaseScenario {
  const requiredPrice = ctx.inputs.hasSalesHistory
    ? solveOperationalTargetPrice(ctx.inputs, params.targetMarginPercent, params.marketingPercent)
    : null;

  const differenceRub =
    requiredPrice !== null ? requiredPrice - ctx.inputs.currentAvgPrice : null;
  const differencePercent =
    differenceRub !== null && ctx.inputs.currentAvgPrice > 0
      ? (differenceRub / ctx.inputs.currentAvgPrice) * 100
      : null;

  const difficulty = classifyPricingStatus(
    differencePercent ?? 0,
    ctx.inputs.hasSalesHistory,
    requiredPrice
  );

  return {
    requiredPrice,
    differenceRub,
    differencePercent,
    difficulty,
    difficultyLabel: PRICING_V3_STATUS_LABEL[difficulty],
  };
}

function findRequiredConversion(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams
): ConversionScenario {
  const { inputs, orders, totalLogistics, conversionPercent } = ctx;
  const price = inputs.currentAvgPrice;
  const target = params.targetMarginPercent;

  if (!inputs.hasSalesHistory || orders <= 0 || price <= 0) {
    return {
      requiredConversionPercent: null,
      conversionIncreasePoints: null,
      expectedOperationalMarginPercent: null,
      expectedPrice: null,
      achievable: false,
      explanation: "Insufficient sales history to model conversion impact.",
    };
  }

  let required: number | null = null;
  for (let c = conversionPercent; c <= 100; c += 0.1) {
    const unitLogistics = unitLogisticsAtConversion(totalLogistics, orders, c);
    const margin = calculateOperationalMarginAtPrice(
      inputs,
      price,
      unitLogistics,
      params.marketingPercent
    );
    if (margin >= target) {
      required = c;
      break;
    }
  }

  if (required === null) {
    return {
      requiredConversionPercent: null,
      conversionIncreasePoints: null,
      expectedOperationalMarginPercent: null,
      expectedPrice: null,
      achievable: false,
      explanation:
        "Even 100% conversion at the current price cannot reach the target operational margin.",
    };
  }

  const unitLogisticsAtRequired = unitLogisticsAtConversion(totalLogistics, orders, required);
  const adjustedInputs = { ...inputs, unitTotalLogistics: unitLogisticsAtRequired };
  const expectedPrice = solveOperationalTargetPrice(
    adjustedInputs,
    params.targetMarginPercent,
    params.marketingPercent
  );
  const expectedMargin = calculateOperationalMarginAtPrice(
    inputs,
    price,
    unitLogisticsAtRequired,
    params.marketingPercent
  );

  return {
    requiredConversionPercent: required,
    conversionIncreasePoints: required - conversionPercent,
    expectedOperationalMarginPercent: expectedMargin,
    expectedPrice,
    achievable: true,
    explanation:
      "Fixed order volume — higher conversion spreads total logistics across more purchases, lowering logistics per unit sold.",
  };
}

export function buildLogisticsSliderScenario(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams,
  reductionPercent: number
): LogisticsSliderScenario {
  const clamped = Math.min(LOGISTICS_REDUCTION_MAX_PERCENT, Math.max(0, reductionPercent));
  const adjustedUnitLogistics = ctx.inputs.unitTotalLogistics * (1 - clamped / 100);
  const adjustedInputs = { ...ctx.inputs, unitTotalLogistics: adjustedUnitLogistics };
  const operationalTargetPrice = ctx.inputs.hasSalesHistory
    ? solveOperationalTargetPrice(
        adjustedInputs,
        params.targetMarginPercent,
        params.marketingPercent
      )
    : null;

  return { reductionPercent: clamped, adjustedUnitLogistics, operationalTargetPrice };
}

export function buildMarketingSliderScenario(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams,
  marketingPercent: number
): MarketingSliderScenario {
  const clamped = Math.min(MARKETING_SLIDER_MAX_PERCENT, Math.max(0, marketingPercent));
  const operationalTargetPrice = ctx.inputs.hasSalesHistory
    ? solveOperationalTargetPrice(ctx.inputs, params.targetMarginPercent, clamped)
    : null;

  return { marketingPercent: clamped, operationalTargetPrice };
}

function evaluateCombinedState(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams,
  priceIncreasePercent: number,
  conversionIncreasePercent: number,
  logisticsReductionPercent: number,
  marketingPercent: number
): { marginPercent: number; price: number; effortScore: number } {
  const newConversion = Math.min(
    100,
    ctx.conversionPercent * (1 + conversionIncreasePercent / 100)
  );
  const unitFromConversion = unitLogisticsAtConversion(
    ctx.totalLogistics * (1 - logisticsReductionPercent / 100),
    ctx.orders,
    newConversion
  );
  const price = ctx.inputs.currentAvgPrice * (1 + priceIncreasePercent / 100);
  const margin = calculateOperationalMarginAtPrice(
    ctx.inputs,
    price,
    unitFromConversion,
    marketingPercent
  );

  const effortScore =
    priceIncreasePercent * 2 +
    conversionIncreasePercent * 1.5 +
    logisticsReductionPercent * 1.2 +
    (params.marketingPercent - marketingPercent) * 1;

  return { marginPercent: margin, price, effortScore };
}

function buildCombinedOptimization(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams
): CombinedOptimizationScenario | null {
  if (!ctx.inputs.hasSalesHistory) return null;

  let best: CombinedOptimizationScenario | null = null;

  for (let priceInc = 0; priceInc <= 40; priceInc += 2) {
    for (let convInc = 0; convInc <= 80; convInc += 5) {
      for (let logRed = 0; logRed <= LOGISTICS_REDUCTION_MAX_PERCENT; logRed += 5) {
        for (let mkt = 0; mkt <= MARKETING_SLIDER_MAX_PERCENT; mkt += 1) {
          const result = evaluateCombinedState(
            ctx,
            params,
            priceInc,
            convInc,
            logRed,
            mkt
          );
          if (result.marginPercent < params.targetMarginPercent) continue;

          const candidate: CombinedOptimizationScenario = {
            priceIncreasePercent: priceInc,
            conversionIncreasePercent: convInc,
            logisticsReductionPercent: logRed,
            marketingPercent: mkt,
            resultingMarginPercent: result.marginPercent,
            resultingPrice: result.price,
            meetsTarget: true,
            effortScore: result.effortScore,
          };

          if (!best || candidate.effortScore < best.effortScore) {
            best = candidate;
          }
        }
      }
    }
  }

  return best;
}

function buildSensitivityAnalysis(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams
): SensitivityAnalysis {
  const baseline = solveOperationalTargetPrice(
    ctx.inputs,
    params.targetMarginPercent,
    params.marketingPercent
  );

  if (!ctx.inputs.hasSalesHistory || baseline === null) {
    return {
      items: [],
      biggestLever: "—",
      largestOpportunity: "—",
    };
  }

  const perturbations: Array<{ key: string; label: string; price: number | null }> = [
    {
      key: "logistics",
      label: "Total Logistics",
      price: solveOperationalTargetPrice(
        {
          ...ctx.inputs,
          unitTotalLogistics: ctx.inputs.unitTotalLogistics * 0.9,
        },
        params.targetMarginPercent,
        params.marketingPercent
      ),
    },
    {
      key: "conversion",
      label: "Conversion",
      price: solveOperationalTargetPrice(
        {
          ...ctx.inputs,
          unitTotalLogistics: unitLogisticsAtConversion(
            ctx.totalLogistics,
            ctx.orders,
            Math.min(100, ctx.conversionPercent * 1.1)
          ),
        },
        params.targetMarginPercent,
        params.marketingPercent
      ),
    },
    {
      key: "productCost",
      label: "Product Cost",
      price: solveOperationalTargetPrice(
        {
          ...ctx.inputs,
          unitProductCost: ctx.inputs.unitProductCost * 0.9,
        },
        params.targetMarginPercent,
        params.marketingPercent
      ),
    },
    {
      key: "commission",
      label: "Commission",
      price: solveOperationalTargetPrice(
        {
          ...ctx.inputs,
          commissionRate: ctx.inputs.commissionRate * 0.9,
        },
        params.targetMarginPercent,
        params.marketingPercent
      ),
    },
    {
      key: "marketing",
      label: "Marketing",
      price: solveOperationalTargetPrice(
        ctx.inputs,
        params.targetMarginPercent,
        params.marketingPercent * 0.9
      ),
    },
  ];

  const items = perturbations
    .map((item) => {
      const impactPercent =
        item.price !== null ? Math.abs(((baseline - item.price) / baseline) * 100) : 0;
      return { ...item, impactPercent };
    })
    .sort((a, b) => b.impactPercent - a.impactPercent);

  const maxImpact = items[0]?.impactPercent || 1;
  const sensitivityItems: SensitivityItem[] = items.map((item) => ({
    key: item.key,
    label: item.label,
    impactPercent: item.impactPercent,
    barWidth: maxImpact > 0 ? Math.round((item.impactPercent / maxImpact) * 10) : 0,
  }));

  const biggest = sensitivityItems[0];
  const opportunity = [...sensitivityItems].sort(
    (a, b) => b.impactPercent - a.impactPercent
  )[0];

  return {
    items: sensitivityItems,
    biggestLever: biggest ? `${biggest.label} (−10% → ${biggest.impactPercent.toFixed(1)}% price change)` : "—",
    largestOpportunity: opportunity
      ? `Improve ${opportunity.label.toLowerCase()} — highest impact on required price`
      : "—",
  };
}

function buildRecoveryRecommendation(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams,
  priceScenario: PriceIncreaseScenario,
  conversionScenario: ConversionScenario,
  combined: CombinedOptimizationScenario | null,
  sensitivity: SensitivityAnalysis
): RecoveryRecommendation {
  if (ctx.inputs.currentOperationalMarginPercent >= params.targetMarginPercent) {
    return {
      headline: "Already at target operational margin",
      detail: "No recovery action required for the selected target margin.",
      category: "already-there",
    };
  }

  const priceDiff = priceScenario.differencePercent ?? Infinity;
  const convGap = conversionScenario.conversionIncreasePoints ?? Infinity;

  if (priceDiff <= 5 && priceScenario.difficulty === "small-increase") {
    return {
      headline: "Increase price only",
      detail: `A ${priceDiff.toFixed(1)}% price increase to ${priceScenario.requiredPrice?.toFixed(0)} ₽ reaches ${params.targetMarginPercent}% operational margin.`,
      category: "price-only",
    };
  }

  if (
    conversionScenario.achievable &&
    convGap <= 15 &&
    priceDiff > 15 &&
    sensitivity.items[0]?.key === "conversion"
  ) {
    return {
      headline: "Improve conversion first",
      detail: `Conversion must rise ${convGap.toFixed(1)} pp to ${conversionScenario.requiredConversionPercent?.toFixed(1)}% before a price hike — excluded logistics per purchase falls as purchases increase.`,
      category: "conversion-first",
    };
  }

  if (
    sensitivity.items[0]?.key === "logistics" &&
    priceDiff > 10
  ) {
    const at20 = buildLogisticsSliderScenario(ctx, params, 20);
    if (
      at20.operationalTargetPrice !== null &&
      ctx.inputs.currentAvgPrice > 0 &&
      ((at20.operationalTargetPrice - ctx.inputs.currentAvgPrice) / ctx.inputs.currentAvgPrice) *
        100 <
        priceDiff - 5
    ) {
      return {
        headline: "Lower logistics before changing price",
        detail: `Total logistics is the biggest lever. A 20% logistics reduction drops the operational target to ${at20.operationalTargetPrice.toFixed(0)} ₽ vs ${priceScenario.requiredPrice?.toFixed(0)} ₽ price-only.`,
        category: "logistics-first",
      };
    }
  }

  if (combined) {
    return {
      headline: "Combined optimization recommended",
      detail: `Price +${combined.priceIncreasePercent}%, conversion +${combined.conversionIncreasePercent}%, logistics −${combined.logisticsReductionPercent}%, marketing ${combined.marketingPercent}% → ${combined.resultingMarginPercent.toFixed(1)}% margin at ${combined.resultingPrice.toFixed(0)} ₽.`,
      category: "combined",
    };
  }

  if (priceDiff > 50 || priceScenario.difficulty === "unrealistic") {
    return {
      headline: "Product not recoverable",
      detail: `Price-only path requires +${priceDiff.toFixed(0)}% (${priceScenario.requiredPrice?.toFixed(0)} ₽) with no realistic combined lever mix found.`,
      category: "not-recoverable",
    };
  }

  return {
    headline: "Increase price with supporting levers",
    detail: `Primary path: raise price to ${priceScenario.requiredPrice?.toFixed(0)} ₽ (+${priceDiff.toFixed(1)}%). Consider pairing with conversion or logistics improvements.`,
    category: "price-only",
  };
}

function buildTimeline(
  ctx: DecisionSimulatorContext,
  params: DecisionSimulatorParams
): TimelineStage[] {
  const breakEvenPrice = ctx.inputs.hasSalesHistory
    ? solveOperationalTargetPrice(ctx.inputs, 0, params.marketingPercent)
    : null;
  const targetPrice = ctx.inputs.hasSalesHistory
    ? solveOperationalTargetPrice(ctx.inputs, params.targetMarginPercent, params.marketingPercent)
    : null;
  const excellentPrice = ctx.inputs.hasSalesHistory
    ? solveOperationalTargetPrice(ctx.inputs, EXCELLENT_MARGIN_PERCENT, params.marketingPercent)
    : null;

  return [
    {
      key: "current",
      label: "Current",
      marginPercent: ctx.inputs.currentOperationalMarginPercent,
      requiredPrice: ctx.inputs.currentAvgPrice,
    },
    {
      key: "break-even",
      label: "Break Even",
      marginPercent: 0,
      requiredPrice: breakEvenPrice,
    },
    {
      key: "target",
      label: "Target Margin",
      marginPercent: params.targetMarginPercent,
      requiredPrice: targetPrice,
    },
    {
      key: "excellent",
      label: "Excellent",
      marginPercent: EXCELLENT_MARGIN_PERCENT,
      requiredPrice: excellentPrice,
    },
  ];
}

export function buildDecisionSimulatorReport(
  product: ProductProfitability,
  cohortMaxOrders: number,
  params: DecisionSimulatorParams = {
    targetMarginPercent: DEFAULT_TARGET_MARGIN_PERCENT,
    marketingPercent: DEFAULT_MARKETING_PERCENT,
  }
): DecisionSimulatorReport {
  const context = buildDecisionSimulatorContext(product, cohortMaxOrders);
  return buildDecisionSimulatorFromContext(context, params);
}

export function buildDecisionSimulatorFromContext(
  context: DecisionSimulatorContext,
  params: DecisionSimulatorParams
): DecisionSimulatorReport {
  const priceScenario = buildPriceIncreaseScenario(context, params);
  const conversionScenario = findRequiredConversion(context, params);
  const combinedScenario = buildCombinedOptimization(context, params);
  const sensitivity = buildSensitivityAnalysis(context, params);
  const recommendation = buildRecoveryRecommendation(
    context,
    params,
    priceScenario,
    conversionScenario,
    combinedScenario,
    sensitivity
  );
  const timeline = buildTimeline(context, params);
  const breakEvenPrice = timeline.find((stage) => stage.key === "break-even")?.requiredPrice ?? null;
  const operationalTargetPrice =
    timeline.find((stage) => stage.key === "target")?.requiredPrice ?? null;

  return {
    context,
    params,
    priceScenario,
    conversionScenario,
    combinedScenario,
    sensitivity,
    recommendation,
    timeline,
    breakEvenPrice,
    operationalTargetPrice,
  };
}
