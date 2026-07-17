import type { ModelBProfitMetrics, ProfitabilityV2BreakdownLine } from "@/types/database";
import {
  type NetSalesResolution,
  shareOfRevenueBasePercent,
} from "@/lib/sales-revenue-resolution";
import { DEFAULT_TAX_PERCENT } from "@/lib/smart-pricing-constants";

/**
 * Profit Engine V3 — Model B (Commercial Performance) + Tax.
 *
 * Customer Payment (priceWithDisc)
 * → Commission = priceWithDisc − Sales API forPay
 * → Sales API forPay (revenue)
 * → Seller Payout = forPay − Acquiring − Logistics − Storage − Penalties − Adjustments
 * → Estimated Tax = Seller Payout × Tax%
 * → Operating Profit = Seller Payout − Product Cost − Advertising
 * → Final Net Profit = After Tax Payout − Product Cost − Advertising
 *
 * Tax base is Seller Payout only — never Selling Price, Product Cost, or Marketing.
 */

export type ModelBTaxParams = {
  taxPercent?: number;
};

export function calculateModelBNetProfit(
  params: {
    grossSales: number;
    returnedSales: number;
    netSales: number;
    netSalesStatus: ModelBProfitMetrics["netSalesStatus"];
    salesForPay: number;
    acquiring: number;
    logistics: number;
    storage: number;
    penalties: number;
    adjustments: number;
    productCost: number;
    advertising: number;
  } & ModelBTaxParams
): ModelBProfitMetrics {
  // Pure math only — no perf-recorder here (client components import this module).
  const taxPercent =
    params.taxPercent !== undefined && Number.isFinite(params.taxPercent)
      ? Math.max(0, params.taxPercent)
      : DEFAULT_TAX_PERCENT;

  const commission = Math.max(0, params.netSales - params.salesForPay);
  const revenue = params.salesForPay;

  /** Seller Payout = forPay after all marketplace deductions (excl. product cost & marketing). */
  const sellerPayout =
    revenue -
    params.acquiring -
    params.logistics -
    params.storage -
    params.penalties -
    params.adjustments;

  const operatingProfit = sellerPayout - params.productCost - params.advertising;

  const estimatedTax =
    sellerPayout > 0 && taxPercent > 0 ? sellerPayout * (taxPercent / 100) : 0;

  const afterTaxPayout = sellerPayout - estimatedTax;
  const finalNetProfit = afterTaxPayout - params.productCost - params.advertising;

  return {
    grossSales: params.grossSales,
    returnedSales: params.returnedSales,
    netSales: params.netSales,
    netSalesStatus: params.netSalesStatus,
    commission,
    acquiring: params.acquiring,
    revenue,
    logistics: params.logistics,
    storage: params.storage,
    penalties: params.penalties,
    adjustments: params.adjustments,
    productCost: params.productCost,
    advertising: params.advertising,
    /** @deprecated Prefer operatingProfit — kept as Operating Profit alias. */
    netProfit: operatingProfit,
    sellerPayout,
    operatingProfit,
    taxPercent,
    estimatedTax,
    afterTaxPayout,
    finalNetProfit,
  };
}

export function buildModelBProfitMetrics(
  netSales: NetSalesInput,
  components: {
    salesForPay: number;
    acquiring: number;
    logistics: number;
    storage: number;
    penalties: number;
    adjustments: number;
    productCost: number;
    advertising: number;
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
    acquiring: components.acquiring,
    logistics: components.logistics,
    storage: components.storage,
    penalties: components.penalties,
    adjustments: components.adjustments,
    productCost: components.productCost,
    advertising: components.advertising,
    taxPercent: components.taxPercent,
  });
}

type NetSalesInput = number | NetSalesResolution;

export function calculateModelBMarginPercent(sales: number, netProfit: number): number {
  if (sales <= 0) return 0;
  return (netProfit / sales) * 100;
}

/** Share of Sales (priceWithDisc) for dashboard KPI subtitles. */
export function shareOfNetSalesPercent(netSales: number, amount: number): number {
  return shareOfRevenueBasePercent(netSales, amount);
}

/** @deprecated Use shareOfNetSalesPercent */
export function shareOfSalesPercent(netSales: number, amount: number): number {
  return shareOfNetSalesPercent(netSales, amount);
}

/**
 * Model B commercial money flow with tax.
 * Final Net Profit = Seller Payout − Estimated Tax − Product Cost − Advertising.
 *
 * Logistics / Storage / Penalties / Adjustments are informational (already inside Seller Payout).
 * Only Tax, Product Cost, and Advertising are deducted from Seller Payout in the total.
 */
export function buildModelBBreakdownLines(
  metrics: ModelBProfitMetrics
): ProfitabilityV2BreakdownLine[] {
  const marketplaceFeesInfo =
    metrics.commission +
    metrics.acquiring +
    metrics.logistics +
    metrics.storage +
    metrics.penalties +
    metrics.adjustments;

  return [
    {
      key: "sellerPayout",
      label: "Revenue (Seller Payout)",
      amount: metrics.sellerPayout,
      detail:
        "Customer Payment − Commission − Acquiring − Logistics − Storage − Penalties − Adjustments",
    },
    {
      key: "logistics",
      label: "Logistics",
      amount: metrics.logistics,
      detail: "Already reflected in Seller Payout (informational)",
    },
    {
      key: "storage",
      label: "Storage",
      amount: metrics.storage,
      detail: "Already reflected in Seller Payout (informational)",
    },
    {
      key: "penalties",
      label: "Penalties",
      amount: metrics.penalties,
      detail: "Already reflected in Seller Payout (informational)",
    },
    {
      key: "adjustments",
      label: "Adjustments",
      amount: metrics.adjustments,
      detail: "Already reflected in Seller Payout (informational)",
    },
    {
      key: "estimatedTax",
      label: "Estimated Tax",
      amount: metrics.estimatedTax,
      isDeduction: true,
      detail: `Seller Payout × ${metrics.taxPercent}% — Product Cost and Marketing do not affect tax base`,
    },
    {
      key: "productCost",
      label: "Product Cost",
      amount: metrics.productCost,
      isDeduction: true,
      detail: "Deducted after tax — does not affect tax base",
    },
    {
      key: "advertising",
      label: "Advertising",
      amount: metrics.advertising,
      isDeduction: true,
      detail: "Deducted after tax — does not affect tax base",
    },
    {
      key: "marketplaceFees",
      label: "Marketplace Fees",
      amount: marketplaceFeesInfo,
      detail:
        "Informational — Commission + Acquiring + Logistics + Storage + Penalties + Adjustments",
    },
    {
      key: "finalNetProfit",
      label: "Final Net Profit",
      amount: metrics.finalNetProfit,
      isTotal: true,
      detail: "Seller Payout − Estimated Tax − Product Cost − Advertising",
    },
  ];
}

/** Arithmetic check: Final Net Profit identity. */
export function verifyModelBFinalProfitArithmetic(metrics: ModelBProfitMetrics): number {
  const manual =
    metrics.sellerPayout -
    metrics.estimatedTax -
    metrics.productCost -
    metrics.advertising;
  return manual - metrics.finalNetProfit;
}

/** @deprecated Use verifyModelBFinalProfitArithmetic */
export function verifyModelBProfitArithmetic(metrics: ModelBProfitMetrics): number {
  const manual =
    metrics.sellerPayout - metrics.productCost - metrics.advertising;
  return manual - metrics.operatingProfit;
}
