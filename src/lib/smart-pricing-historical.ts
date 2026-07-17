/**
 * Historical P&L-based pricing — used by Decision Simulator and Pricing Health only.
 * Smart Pricing page uses forward-looking engine in smart-pricing.ts.
 */
import { calculateNetMarginPercent } from "@/lib/profit-margin";
import {
  buildProductOperationalMetrics,
  calculateOtherMarketplaceCosts,
  calculateTotalLogistics,
} from "@/lib/product-operational-metrics";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  SMART_PRICING_MARGIN_PRESETS,
} from "@/lib/smart-pricing-constants";
import type { ProductProfitability } from "@/types/database";

export {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  SMART_PRICING_MARGIN_PRESETS,
};

/** Historical unit economics derived from ProductProfitability — no duplicate P&L. */
export type ProductPricingHistoricalInputs = {
  productId: string;
  supplierArticle: string;
  productName: string;
  unitsSold: number;
  orders: number;
  currentAvgPrice: number;
  currentNetMarginPercent: number;
  currentOperationalMarginPercent: number;
  commissionRate: number;
  unitProductCost: number;
  unitPurchaseLogistics: number;
  unitTotalLogistics: number;
  unitReturnLogistics: number;
  unitOtherDeductions: number;
  hasSalesHistory: boolean;
};

export type SmartPricingHistoricalStatus =
  | "profitable"
  | "small-increase"
  | "difficult"
  | "unrealistic"
  | "no-data"
  | "infeasible";

/** @deprecated V2 recovery labels */
export type SmartPricingLegacyStatus =
  | "easy"
  | "possible"
  | "difficult"
  | "unrealistic"
  | "no-data"
  | "infeasible";

export const PRICING_V3_STATUS_LABEL: Record<SmartPricingHistoricalStatus, string> = {
  profitable: "🟢 Already profitable",
  "small-increase": "🟡 Small increase",
  difficult: "🟠 Difficult",
  unrealistic: "🔴 Unrealistic",
  "no-data": "⚪ No Data",
  infeasible: "🔴 Unrealistic",
};

export const RECOVERY_STATUS_LABEL: Record<SmartPricingLegacyStatus, string> = {
  easy: "🟢 Easy",
  possible: "🟡 Possible",
  difficult: "🟠 Difficult",
  unrealistic: "🔴 Unrealistic",
  "no-data": "⚪ No Data",
  infeasible: "🔴 Infeasible",
};

type PricingSolverInputs = Pick<
  ProductPricingHistoricalInputs,
  | "unitProductCost"
  | "unitReturnLogistics"
  | "unitOtherDeductions"
  | "commissionRate"
> & {
  unitLogistics: number;
};

export function deriveProductPricingInputs(
  product: ProductProfitability
): ProductPricingHistoricalInputs {
  const unitsSold = product.unitsSold;
  const hasSalesHistory = unitsSold > 0 && product.revenue > 0;

  if (!hasSalesHistory) {
    return {
      productId: product.productId,
      supplierArticle: product.modelCode,
      productName: product.productName,
      unitsSold: 0,
      orders: 0,
      currentAvgPrice: 0,
      currentNetMarginPercent: 0,
      currentOperationalMarginPercent: 0,
      commissionRate: 0,
      unitProductCost: 0,
      unitPurchaseLogistics: 0,
      unitTotalLogistics: 0,
      unitReturnLogistics: 0,
      unitOtherDeductions: 0,
      hasSalesHistory: false,
    };
  }

  const q = unitsSold;
  const revenue = product.revenue;
  const ops = buildProductOperationalMetrics(product);
  const totalLogistics = calculateTotalLogistics(product);
  const otherMarketplace = calculateOtherMarketplaceCosts(product);

  return {
    productId: product.productId,
    supplierArticle: product.modelCode,
    productName: product.productName,
    unitsSold: q,
    orders: product.orders,
    currentAvgPrice: revenue / q,
    currentNetMarginPercent: calculateNetMarginPercent(revenue, product.netProfit),
    currentOperationalMarginPercent: ops.operationalMarginPercent,
    commissionRate: product.commission / revenue,
    unitProductCost: product.productCost / q,
    unitPurchaseLogistics: product.purchaseLogistics / q,
    unitTotalLogistics: totalLogistics / q,
    unitReturnLogistics: product.returnLogistics / q,
    unitOtherDeductions: otherMarketplace / q,
    hasSalesHistory: true,
  };
}

export function solveTargetPrice(
  inputs: PricingSolverInputs,
  targetMarginPercent: number,
  marketingPercent: number
): number | null {
  const m = targetMarginPercent / 100;
  const beta = marketingPercent / 100;
  const alpha = inputs.commissionRate;

  const fixedCosts =
    inputs.unitProductCost +
    inputs.unitLogistics +
    inputs.unitReturnLogistics +
    inputs.unitOtherDeductions;

  const denominator = 1 - alpha - beta - m;
  if (denominator <= 0) return null;

  const price = fixedCosts / denominator;
  if (!Number.isFinite(price) || price <= 0) return null;

  return price;
}

export function solveFinancialTargetPrice(
  inputs: Pick<
    ProductPricingHistoricalInputs,
    | "unitProductCost"
    | "unitPurchaseLogistics"
    | "unitReturnLogistics"
    | "unitOtherDeductions"
    | "commissionRate"
  >,
  targetMarginPercent: number,
  marketingPercent: number
): number | null {
  return solveTargetPrice(
    { ...inputs, unitLogistics: inputs.unitPurchaseLogistics },
    targetMarginPercent,
    marketingPercent
  );
}

export function solveOperationalTargetPrice(
  inputs: Pick<
    ProductPricingHistoricalInputs,
    | "unitProductCost"
    | "unitTotalLogistics"
    | "unitReturnLogistics"
    | "unitOtherDeductions"
    | "commissionRate"
  >,
  targetMarginPercent: number,
  marketingPercent: number
): number | null {
  return solveTargetPrice(
    { ...inputs, unitLogistics: inputs.unitTotalLogistics },
    targetMarginPercent,
    marketingPercent
  );
}

export const solveRecommendedPrice = solveOperationalTargetPrice;

export function classifyPricingStatus(
  differencePercent: number,
  hasSalesHistory: boolean,
  targetPrice: number | null
): SmartPricingHistoricalStatus {
  if (!hasSalesHistory) return "no-data";
  if (targetPrice === null) return "infeasible";
  if (differencePercent <= 0) return "profitable";
  if (differencePercent < 10) return "small-increase";
  if (differencePercent < 20) return "difficult";
  return "unrealistic";
}

function buildPriceDiff(
  currentAvgPrice: number,
  targetPrice: number | null
): { differenceRub: number | null; differencePercent: number | null } {
  if (targetPrice === null) {
    return { differenceRub: null, differencePercent: null };
  }

  const differenceRub = targetPrice - currentAvgPrice;
  const differencePercent =
    currentAvgPrice > 0 ? (differenceRub / currentAvgPrice) * 100 : null;

  return { differenceRub, differencePercent };
}

export type SmartPricingComputedRow = ProductPricingHistoricalInputs & {
  operationalPriceFor20: number | null;
  operationalPriceFor25: number | null;
  operationalPriceFor30: number | null;
  operationalPriceFor35: number | null;
  operationalTargetPrice: number | null;
  operationalDifferenceRub: number | null;
  operationalDifferencePercent: number | null;
  operationalStatus: SmartPricingHistoricalStatus;
  financialTargetPrice: number | null;
  priceFor20: number | null;
  priceFor25: number | null;
  priceFor30: number | null;
  priceFor35: number | null;
  targetPrice: number | null;
  differenceRub: number | null;
  differencePercent: number | null;
  status: SmartPricingHistoricalStatus;
};

export function buildSmartPricingRow(
  inputs: ProductPricingHistoricalInputs,
  targetMarginPercent: number,
  marketingPercent: number
): SmartPricingComputedRow {
  const operationalPriceFor = (margin: number) =>
    inputs.hasSalesHistory
      ? solveOperationalTargetPrice(inputs, margin, marketingPercent)
      : null;

  const operationalPriceFor20 = operationalPriceFor(20);
  const operationalPriceFor25 = operationalPriceFor(25);
  const operationalPriceFor30 = operationalPriceFor(30);
  const operationalPriceFor35 = operationalPriceFor(35);
  const operationalTargetPrice = operationalPriceFor(targetMarginPercent);

  const financialTargetPrice = inputs.hasSalesHistory
    ? solveFinancialTargetPrice(inputs, targetMarginPercent, marketingPercent)
    : null;

  const { differenceRub: operationalDifferenceRub, differencePercent: operationalDifferencePercent } =
    buildPriceDiff(inputs.currentAvgPrice, operationalTargetPrice);

  const operationalStatus = classifyPricingStatus(
    operationalDifferencePercent ?? 0,
    inputs.hasSalesHistory,
    operationalTargetPrice
  );

  return {
    ...inputs,
    operationalPriceFor20,
    operationalPriceFor25,
    operationalPriceFor30,
    operationalPriceFor35,
    operationalTargetPrice,
    operationalDifferenceRub,
    operationalDifferencePercent,
    operationalStatus,
    financialTargetPrice,
    priceFor20: operationalPriceFor20,
    priceFor25: operationalPriceFor25,
    priceFor30: operationalPriceFor30,
    priceFor35: operationalPriceFor35,
    targetPrice: operationalTargetPrice,
    differenceRub: operationalDifferenceRub,
    differencePercent: operationalDifferencePercent,
    status: operationalStatus,
  };
}

export function buildSmartPricingRows(
  products: ProductProfitability[],
  targetMarginPercent: number,
  marketingPercent: number
): SmartPricingComputedRow[] {
  return products
    .map((product) => deriveProductPricingInputs(product))
    .map((inputs) => buildSmartPricingRow(inputs, targetMarginPercent, marketingPercent))
    .sort((a, b) => {
      if (a.hasSalesHistory !== b.hasSalesHistory) return a.hasSalesHistory ? -1 : 1;
      return (b.operationalDifferencePercent ?? -Infinity) - (a.operationalDifferencePercent ?? -Infinity);
    });
}

export type SmartPricingSummary = {
  productsAnalyzed: number;
  averageRequiredIncreasePercent: number;
  productsAboveTarget: number;
  productsNeedingOver20Percent: number;
  productsNoSalesHistory: number;
};

export function buildSmartPricingSummary(rows: SmartPricingComputedRow[]): SmartPricingSummary {
  const withHistory = rows.filter(
    (row) => row.hasSalesHistory && row.operationalDifferencePercent !== null
  );
  const needingIncrease = withHistory.filter((row) => (row.operationalDifferencePercent ?? 0) > 0);

  return {
    productsAnalyzed: withHistory.length,
    averageRequiredIncreasePercent:
      needingIncrease.length > 0
        ? needingIncrease.reduce((sum, row) => sum + (row.operationalDifferencePercent ?? 0), 0) /
          needingIncrease.length
        : 0,
    productsAboveTarget: withHistory.filter((row) => (row.operationalDifferencePercent ?? 0) <= 0)
      .length,
    productsNeedingOver20Percent: withHistory.filter(
      (row) => (row.operationalDifferencePercent ?? 0) > 20
    ).length,
    productsNoSalesHistory: rows.filter((row) => !row.hasSalesHistory).length,
  };
}

export function verifyOperationalTargetPrice(
  inputs: ProductPricingHistoricalInputs,
  targetMarginPercent: number,
  marketingPercent: number,
  price: number
): { operationalProfit: number; operationalMarginPercent: number } {
  const beta = marketingPercent / 100;
  const alpha = inputs.commissionRate;
  const operationalProfit =
    price -
    inputs.unitProductCost -
    alpha * price -
    inputs.unitTotalLogistics -
    inputs.unitReturnLogistics -
    beta * price -
    inputs.unitOtherDeductions;

  return {
    operationalProfit,
    operationalMarginPercent: price > 0 ? (operationalProfit / price) * 100 : 0,
  };
}
