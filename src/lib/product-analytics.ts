import {
  calculateGrossMarginPercent,
  calculateGrossProfit,
  calculateMarketplaceFeesFromParts,
  calculateNetMarginPercent,
} from "@/lib/profitability-v2";
import { isProductAnalyticsV3Candidate } from "@/lib/product-funnel-metrics";
import {
  buildProductOperationalMetrics,
  calculateOperationalProfit,
  calculateOtherMarketplaceCosts,
  calculateTotalLogistics,
} from "@/lib/product-operational-metrics";
import type {
  ProductAnalyticsRow,
  ProductAnalyticsTotals,
  ProductAnalyticsV3Row,
  ProductProfitability,
} from "@/types/database";

export function toProductAnalyticsRow(product: ProductProfitability): ProductAnalyticsRow {
  const grossProfit = calculateGrossProfit(product);

  return {
    productId: product.productId,
    supplierArticle: product.modelCode,
    productName: product.productName,
    revenue: product.revenue,
    quantitySold: product.unitsSold,
    productCost: product.productCost,
    marketplaceFees: calculateMarketplaceFeesFromParts(product.commission, product.otherExpenses),
    netProfit: product.netProfit,
    marginPercent: calculateGrossMarginPercent(product.revenue, grossProfit),
  };
}

export function toProductAnalyticsV3Row(product: ProductProfitability): ProductAnalyticsV3Row {
  const ops = buildProductOperationalMetrics(product);

  return {
    productId: product.productId,
    supplierArticle: product.modelCode,
    productName: product.productName,
    orders: product.orders,
    purchases: product.purchases,
    conversionPercent: product.conversionPercent,
    cancelled: product.cancelled,
    cancellationPercent: product.cancellationPercent,
    revenue: product.revenue,
    commission: product.commission,
    totalLogistics: ops.totalLogistics,
    purchaseLogistics: ops.purchaseLogistics,
    excludedLogistics: ops.excludedLogistics,
    returnLogistics: ops.returnLogistics,
    otherMarketplaceCosts: ops.otherMarketplaceCosts,
    productCost: product.productCost,
    operationalProfit: ops.operationalProfit,
    operationalMarginPercent: ops.operationalMarginPercent,
    financialNetProfit: ops.financialNetProfit,
  };
}

export function buildProductAnalyticsRows(products: ProductProfitability[]): ProductAnalyticsRow[] {
  return products
    .filter((product) => product.revenue > 0)
    .map(toProductAnalyticsRow)
    .sort((a, b) => b.netProfit - a.netProfit);
}

export function buildProductAnalyticsV3Rows(
  products: ProductProfitability[]
): ProductAnalyticsV3Row[] {
  return products
    .filter(isProductAnalyticsV3Candidate)
    .map(toProductAnalyticsV3Row)
    .sort((a, b) => b.operationalProfit - a.operationalProfit);
}

export function pickTopByNetProfit(rows: ProductAnalyticsRow[], limit = 10): ProductAnalyticsRow[] {
  return rows.slice(0, limit);
}

export function pickTopV3ByOperationalProfit(
  rows: ProductAnalyticsV3Row[],
  limit = 10
): ProductAnalyticsV3Row[] {
  return rows.slice(0, limit);
}

export function pickBottomByNetProfit(
  rows: ProductAnalyticsRow[],
  limit = 10
): ProductAnalyticsRow[] {
  return [...rows].sort((a, b) => a.netProfit - b.netProfit).slice(0, limit);
}

export function pickBottomV3ByOperationalProfit(
  rows: ProductAnalyticsV3Row[],
  limit = 10
): ProductAnalyticsV3Row[] {
  return [...rows].sort((a, b) => a.operationalProfit - b.operationalProfit).slice(0, limit);
}

/** @deprecated Use pickTopV3ByOperationalProfit */
export const pickTopV3ByNetProfit = pickTopV3ByOperationalProfit;

/** @deprecated Use pickBottomV3ByOperationalProfit */
export const pickBottomV3ByNetProfit = pickBottomV3ByOperationalProfit;

/** Sum financial validation metrics across products with revenue. */
function sumFinancialTotals(products: ProductProfitability[]) {
  return products
    .filter((product) => product.revenue > 0)
    .reduce(
      (acc, product) => {
        acc.revenue += product.revenue;
        acc.productCost += product.productCost;
        acc.marketplaceFees += calculateMarketplaceFeesFromParts(
          product.commission,
          product.otherExpenses
        );
        acc.purchaseLogistics += product.purchaseLogistics;
        acc.excludedLogistics += product.excludedLogistics;
        acc.returnLogistics += product.returnLogistics;
        acc.netProfit += product.netProfit;
        acc.purchaseLogisticsRows += product.purchaseLogisticsRows;
        acc.excludedLogisticsRows += product.excludedLogisticsRows;
        return acc;
      },
      {
        productCount: 0,
        revenue: 0,
        productCost: 0,
        marketplaceFees: 0,
        purchaseLogistics: 0,
        excludedLogistics: 0,
        returnLogistics: 0,
        netProfit: 0,
        purchaseLogisticsRows: 0,
        excludedLogisticsRows: 0,
      }
    );
}

/** Sum metrics across V3 table rows (orders > 0 OR purchases > 0 OR revenue > 0). */
export function buildProductAnalyticsTotals(
  products: ProductProfitability[]
): ProductAnalyticsTotals {
  const financial = sumFinancialTotals(products);
  financial.productCount = products.filter((product) => product.revenue > 0).length;

  const v3Products = products.filter(isProductAnalyticsV3Candidate);
  const v3Rollup = v3Products.reduce(
    (acc, product) => {
      acc.orders += product.orders;
      acc.purchases += product.purchases;
      acc.cancelled += product.cancelled;
      acc.commission += product.commission;
      acc.marketing += product.advertising;
      acc.totalLogistics += calculateTotalLogistics(product);
      acc.otherMarketplaceCosts += calculateOtherMarketplaceCosts(product);
      acc.operationalProfit += calculateOperationalProfit(product);
      return acc;
    },
    {
      orders: 0,
      purchases: 0,
      cancelled: 0,
      commission: 0,
      marketing: 0,
      totalLogistics: 0,
      otherMarketplaceCosts: 0,
      operationalProfit: 0,
    }
  );

  const conversionPercent =
    v3Rollup.orders > 0 ? (v3Rollup.purchases / v3Rollup.orders) * 100 : 0;
  const cancellationPercent =
    v3Rollup.orders > 0 ? (v3Rollup.cancelled / v3Rollup.orders) * 100 : 0;
  const lostOrders = v3Rollup.orders - v3Rollup.purchases;

  const v3Revenue = v3Products.reduce((sum, product) => sum + product.revenue, 0);

  return {
    ...financial,
    orders: v3Rollup.orders,
    purchases: v3Rollup.purchases,
    conversionPercent,
    cancelled: v3Rollup.cancelled,
    cancellationPercent,
    lostOrders,
    commission: v3Rollup.commission,
    marketing: v3Rollup.marketing,
    totalLogistics: v3Rollup.totalLogistics,
    otherMarketplaceCosts: v3Rollup.otherMarketplaceCosts,
    operationalProfit: v3Rollup.operationalProfit,
    operationalMarginPercent: calculateNetMarginPercent(v3Revenue, v3Rollup.operationalProfit),
    marginPercent: calculateNetMarginPercent(v3Revenue, financial.netProfit),
  };
}

/** Validates financial net profit (dashboard engine) — unchanged. */
export function verifyProductAnalyticsTotals(
  products: ProductProfitability[],
  totals: ProductAnalyticsTotals
): { ok: boolean; delta: number } {
  const withRevenue = products.filter((product) => product.revenue > 0);
  const recomputedNet = withRevenue.reduce((sum, product) => {
    return (
      sum +
      (product.revenue -
        product.productCost -
        product.commission -
        product.logistics -
        product.returnLogistics -
        product.storage -
        product.advertising -
        product.penalties -
        product.otherExpenses)
    );
  }, 0);

  const delta = Math.abs(recomputedNet - totals.netProfit);
  return { ok: delta < 0.02, delta };
}

/** Validates operational profit rollup vs row sums. */
export function verifyProductAnalyticsOperationalTotals(
  rows: ProductAnalyticsV3Row[],
  totals: ProductAnalyticsTotals
): { ok: boolean; deltas: Record<string, number> } {
  const sum = (key: keyof ProductAnalyticsV3Row) =>
    rows.reduce((acc, row) => acc + Number(row[key]), 0);

  const deltas = {
    totalLogistics: Math.abs(sum("totalLogistics") - totals.totalLogistics),
    operationalProfit: Math.abs(sum("operationalProfit") - totals.operationalProfit),
    commission: Math.abs(sum("commission") - totals.commission),
  };

  const ok = Object.values(deltas).every((delta) => delta < 0.02);
  return { ok, deltas };
}

/** Validates V3 funnel columns reconcile with rolled-up totals. */
export function verifyProductAnalyticsV3Totals(
  rows: ProductAnalyticsV3Row[],
  totals: ProductAnalyticsTotals
): { ok: boolean; deltas: Record<string, number> } {
  const sum = (key: keyof ProductAnalyticsV3Row) =>
    rows.reduce((acc, row) => acc + Number(row[key]), 0);

  const deltas = {
    orders: Math.abs(sum("orders") - totals.orders),
    purchases: Math.abs(sum("purchases") - totals.purchases),
    cancelled: Math.abs(sum("cancelled") - totals.cancelled),
    commission: Math.abs(sum("commission") - totals.commission),
    lostOrders: Math.abs(sum("orders") - sum("purchases") - totals.lostOrders),
  };

  const ok = Object.values(deltas).every((delta) => delta < 0.02);
  return { ok, deltas };
}

/** Financial net profit − operational profit (per SKU). */
export function reconcileFinancialVsOperational(product: ProductProfitability): number {
  return product.netProfit - calculateOperationalProfit(product);
}
