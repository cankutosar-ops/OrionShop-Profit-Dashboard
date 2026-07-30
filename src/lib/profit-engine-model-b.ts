import type { ModelBProfitMetrics, ProfitabilityV2BreakdownLine } from "@/types/database";
import {
  type NetSalesResolution,
  shareOfRevenueBasePercent,
} from "@/lib/sales-revenue-resolution";
import { DEFAULT_TAX_PERCENT } from "@/lib/smart-pricing-constants";
import { calculateEstimatedTax } from "@/lib/financial-engine-tax";

/**
 * Commercial Performance Engine V4 (implementation).
 *
 * Public import surface: `@/lib/financial-engine`
 *
 * Sales              = Σ priceWithDisc
 * Marketplace Fee    = Sales − Sales API forPay
 * Acquiring          = Σ acquiring_fee (display)
 * Revenue            = Σ ppvz_for_pay
 * Estimated Tax      = Tax% × Σ finishedPrice (historical reporting)
 * Net Profit         = Revenue − PC − Logistics − Storage − Acceptance
 *                      − Penalties − Other − Ads − Estimated Tax
 *
 * Smart Pricing uses a separate tax base (Sale − Marketplace Fee).
 * See docs/estimated-tax-models.md — do not unify.
 */

export type ModelBTaxParams = {
  taxPercent?: number;
  /**
   * Tax base passed to calculateEstimatedTax.
   * Reporting: Σ finishedPrice. Smart Pricing unit path: Sale − Marketplace Fee.
   */
  customerPaid?: number;
};

export function calculateModelBNetProfit(
  params: {
    grossSales: number;
    returnedSales: number;
    netSales: number;
    netSalesStatus: ModelBProfitMetrics["netSalesStatus"];
    salesForPay: number;
    financeNetForPay: number;
    acquiring: number;
    logistics: number;
    storage: number;
    penalties: number;
    adjustments: number;
    acceptance: number;
    productCost: number;
    advertising: number;
  } & ModelBTaxParams
): ModelBProfitMetrics {
  const taxPercent =
    params.taxPercent !== undefined && Number.isFinite(params.taxPercent)
      ? Math.max(0, params.taxPercent)
      : DEFAULT_TAX_PERCENT;

  const customerPaid =
    params.customerPaid !== undefined && Number.isFinite(params.customerPaid)
      ? params.customerPaid
      : 0;

  const marketplaceFee = Math.max(0, params.netSales - params.salesForPay);
  const revenue = params.financeNetForPay;

  const sellerPayout =
    revenue -
    params.logistics -
    params.storage -
    params.acceptance -
    params.penalties -
    params.adjustments;

  const estimatedTax = calculateEstimatedTax(customerPaid, taxPercent);
  const afterTaxPayout = sellerPayout - estimatedTax;

  const operatingProfit =
    revenue -
    params.productCost -
    params.logistics -
    params.storage -
    params.acceptance -
    params.penalties -
    params.adjustments -
    params.advertising;

  const finalNetProfit = operatingProfit - estimatedTax;

  return {
    grossSales: params.grossSales,
    returnedSales: params.returnedSales,
    netSales: params.netSales,
    netSalesStatus: params.netSalesStatus,
    commission: marketplaceFee,
    marketplaceFee,
    acquiring: params.acquiring,
    revenue,
    logistics: params.logistics,
    storage: params.storage,
    penalties: params.penalties,
    adjustments: params.adjustments,
    acceptance: params.acceptance,
    productCost: params.productCost,
    advertising: params.advertising,
    netProfit: operatingProfit,
    sellerPayout,
    operatingProfit,
    taxPercent,
    customerPaid,
    estimatedTax,
    afterTaxPayout,
    finalNetProfit,
  };
}

export function buildModelBProfitMetrics(
  netSales: NetSalesInput,
  components: {
    salesForPay: number;
    financeNetForPay: number;
    acquiring: number;
    logistics: number;
    storage: number;
    penalties: number;
    adjustments: number;
    acceptance: number;
    productCost: number;
    advertising: number;
    customerPaid: number;
    taxPercent?: number;
  }
): ModelBProfitMetrics {
  const resolved =
    typeof netSales === "number"
      ? {
          grossSales: netSales,
          returnedSales: 0,
          netSales,
          status: "ready" as const,
        }
      : netSales;

  return calculateModelBNetProfit({
    grossSales: resolved.grossSales,
    returnedSales: resolved.returnedSales,
    netSales: resolved.netSales,
    netSalesStatus: resolved.status,
    salesForPay: components.salesForPay,
    financeNetForPay: components.financeNetForPay,
    acquiring: components.acquiring,
    logistics: components.logistics,
    storage: components.storage,
    penalties: components.penalties,
    adjustments: components.adjustments,
    acceptance: components.acceptance,
    productCost: components.productCost,
    advertising: components.advertising,
    customerPaid: components.customerPaid,
    taxPercent: components.taxPercent,
  });
}

type NetSalesInput = number | NetSalesResolution;

export function calculateModelBMarginPercent(sales: number, netProfit: number): number {
  if (sales <= 0) return 0;
  return (netProfit / sales) * 100;
}

export function shareOfNetSalesPercent(netSales: number, amount: number): number {
  return shareOfRevenueBasePercent(netSales, amount);
}

/** @deprecated Use shareOfNetSalesPercent */
export function shareOfSalesPercent(netSales: number, amount: number): number {
  return shareOfNetSalesPercent(netSales, amount);
}

export function buildModelBBreakdownLines(
  metrics: ModelBProfitMetrics
): ProfitabilityV2BreakdownLine[] {
  return [
    {
      key: "revenue",
      label: "Revenue",
      amount: metrics.revenue,
      detail: "Finance Σ ppvz_for_pay",
    },
    {
      key: "logistics",
      label: "Logistics",
      amount: metrics.logistics,
      isDeduction: true,
      detail: "Finance logistics",
    },
    {
      key: "storage",
      label: "Storage",
      amount: metrics.storage,
      isDeduction: true,
      detail: "Finance storage",
    },
    {
      key: "acceptance",
      label: "Acceptance",
      amount: metrics.acceptance,
      isDeduction: true,
      detail: "Finance acceptance",
    },
    {
      key: "penalties",
      label: "Penalties",
      amount: metrics.penalties,
      isDeduction: true,
      detail: "Finance penalties",
    },
    {
      key: "adjustments",
      label: "Other Marketplace Expenses",
      amount: metrics.adjustments,
      isDeduction: true,
      detail: "Finance adjustments / other holds",
    },
    {
      key: "productCost",
      label: "Product Cost",
      amount: metrics.productCost,
      isDeduction: true,
      detail: "Product cost",
    },
    {
      key: "advertising",
      label: "Advertising",
      amount: metrics.advertising,
      isDeduction: true,
      detail: "Advertising spend",
    },
    {
      key: "estimatedTax",
      label: "Estimated Tax",
      amount: metrics.estimatedTax,
      isDeduction: true,
      detail: `${metrics.taxPercent}% × Σ finishedPrice (${metrics.customerPaid.toLocaleString("ru-RU")} ₽ customer paid)`,
    },
    {
      key: "marketplaceFee",
      label: "Marketplace Fee (informational)",
      amount: metrics.marketplaceFee ?? metrics.commission,
      detail: "Sales − Sales API forPay — not deducted again in Net Profit",
    },
    {
      key: "acquiring",
      label: "Acquiring (informational)",
      amount: metrics.acquiring,
      detail: "Already reflected before Revenue — not deducted again in Net Profit",
    },
    {
      key: "finalNetProfit",
      label: "Net Profit",
      amount: metrics.finalNetProfit,
      isTotal: true,
      detail:
        "Revenue − Product Cost − Logistics − Storage − Acceptance − Penalties − Other − Advertising − Estimated Tax",
    },
  ];
}

export function verifyModelBFinalProfitArithmetic(metrics: ModelBProfitMetrics): number {
  const manual =
    metrics.revenue -
    metrics.productCost -
    metrics.logistics -
    metrics.storage -
    metrics.acceptance -
    metrics.penalties -
    metrics.adjustments -
    metrics.advertising -
    metrics.estimatedTax;
  return manual - metrics.finalNetProfit;
}

/** @deprecated Use verifyModelBFinalProfitArithmetic */
export function verifyModelBProfitArithmetic(metrics: ModelBProfitMetrics): number {
  const manual =
    metrics.revenue -
    metrics.productCost -
    metrics.logistics -
    metrics.storage -
    metrics.acceptance -
    metrics.penalties -
    metrics.adjustments -
    metrics.advertising;
  return manual - metrics.operatingProfit;
}
