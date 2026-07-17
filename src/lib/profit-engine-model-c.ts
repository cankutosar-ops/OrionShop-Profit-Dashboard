import type { ModelCProfitMetrics, ProfitabilityV2BreakdownLine } from "@/types/database";

/**
 * Profit Engine V3 — Model C (Settlement Profit).
 *
 * Revenue = netForPay
 * Net Profit = netForPay − Logistics − Storage − Penalties − Deductions − Acceptance − Product Cost − Advertising
 *
 * Marketplace Fees are informational only and must not be deducted.
 */
export function calculateModelCNetProfit(params: {
  netForPay: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  penalties: number;
  deductions: number;
  acceptance: number;
  productCost: number;
  advertising: number;
}): ModelCProfitMetrics {
  const revenue = params.netForPay;
  const netProfit =
    revenue -
    params.logistics -
    params.storage -
    params.penalties -
    params.deductions -
    params.acceptance -
    params.productCost -
    params.advertising;

  return {
    revenue,
    marketplaceFees: params.marketplaceFees,
    logistics: params.logistics,
    storage: params.storage,
    penalties: params.penalties,
    deductions: params.deductions,
    acceptance: params.acceptance,
    productCost: params.productCost,
    advertising: params.advertising,
    netProfit,
  };
}

export function buildModelCProfitMetrics(components: {
  netForPay: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  penalties: number;
  deductions: number;
  acceptance: number;
  productCost: number;
  advertising: number;
}): ModelCProfitMetrics {
  return calculateModelCNetProfit(components);
}

export function calculateModelCMarginPercent(revenue: number, netProfit: number): number {
  if (revenue <= 0) return 0;
  return (netProfit / revenue) * 100;
}

/** Share of Revenue (netForPay) for dashboard KPI subtitles. */
export function shareOfRevenuePercent(revenue: number, amount: number): number {
  if (revenue <= 0) return 0;
  return (amount / revenue) * 100;
}

/** Presentation-only breakdown lines — values come directly from Model C engine output. */
export function buildModelCBreakdownLines(metrics: ModelCProfitMetrics): ProfitabilityV2BreakdownLine[] {
  return [
    {
      key: "revenue",
      label: "Revenue (netForPay)",
      amount: metrics.revenue,
      detail: "Goods settlement (К перечислению за товар)",
    },
    {
      key: "logistics",
      label: "Logistics",
      amount: metrics.logistics,
      isDeduction: true,
      detail: "Delivery and return logistics",
    },
    {
      key: "storage",
      label: "Storage",
      amount: metrics.storage,
      isDeduction: true,
    },
    {
      key: "penalties",
      label: "Penalties",
      amount: metrics.penalties,
      isDeduction: true,
    },
    {
      key: "deductions",
      label: "Deductions",
      amount: metrics.deductions,
      isDeduction: true,
    },
    {
      key: "acceptance",
      label: "Acceptance",
      amount: metrics.acceptance,
      isDeduction: true,
    },
    {
      key: "productCost",
      label: "Product Cost",
      amount: metrics.productCost,
      isDeduction: true,
      detail: "Latest active cost × sold quantity",
    },
    {
      key: "advertising",
      label: "Advertising",
      amount: metrics.advertising,
      isDeduction: true,
      detail: "WB ads spend (wb_ads)",
    },
    {
      key: "marketplaceFees",
      label: "Marketplace Fees",
      amount: metrics.marketplaceFees,
      detail: "Informational only — not deducted from Net Profit",
    },
    {
      key: "netProfit",
      label: "Net Profit",
      amount: metrics.netProfit,
      isTotal: true,
    },
  ];
}

/** Manual formula check: deductible lines must reconcile to engine netProfit. */
export function verifyModelCProfitArithmetic(metrics: ModelCProfitMetrics): number {
  const manual =
    metrics.revenue -
    metrics.logistics -
    metrics.storage -
    metrics.penalties -
    metrics.deductions -
    metrics.acceptance -
    metrics.productCost -
    metrics.advertising;
  return manual - metrics.netProfit;
}
