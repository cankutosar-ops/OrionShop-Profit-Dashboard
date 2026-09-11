/**
 * Sprint 9.1 — Profit & Loss report projection from Financial Engine V4.
 * Never recalculates business math — maps Model B / product engine outputs only.
 */

import { calculateModelBMarginPercent } from "@/lib/financial-engine";
import type { ModelBProfitMetrics, ProductProfitability } from "@/types/database";

export type PnLLineId =
  | "grossSales"
  | "returnedSales"
  | "netSales"
  | "revenue"
  | "marketplaceFees"
  | "acquiring"
  | "logistics"
  | "storage"
  | "acceptance"
  | "penalties"
  | "adjustments"
  | "productCost"
  | "advertising"
  | "estimatedTax"
  | "operatingProfit"
  | "netProfit"
  | "netMargin";

export type PnLLine = {
  id: PnLLineId;
  label: string;
  amount: number;
  /** True for margin % row (not currency). */
  isPercent?: boolean;
  isTotal?: boolean;
};

export type PnLReportView = {
  source: "financialEngine.modelB" | "productRows.aggregated";
  currency: string;
  lines: PnLLine[];
  /** Engine Net Profit for identity checks. */
  netProfit: number;
  netMarginPercent: number;
};

function linesFromAmounts(params: {
  grossSales: number;
  returnedSales: number;
  netSales: number;
  revenue: number;
  marketplaceFees: number;
  acquiring: number;
  logistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  adjustments: number;
  productCost: number;
  advertising: number;
  estimatedTax: number;
  operatingProfit: number;
  netProfit: number;
}): PnLLine[] {
  const netMarginPercent = calculateModelBMarginPercent(params.revenue, params.netProfit);
  return [
    { id: "grossSales", label: "Gross Sales", amount: params.grossSales },
    { id: "returnedSales", label: "Returned Sales", amount: params.returnedSales },
    { id: "netSales", label: "Net Sales", amount: params.netSales },
    { id: "revenue", label: "Revenue", amount: params.revenue },
    { id: "marketplaceFees", label: "Marketplace Fee", amount: params.marketplaceFees },
    { id: "acquiring", label: "Acquiring", amount: params.acquiring },
    { id: "logistics", label: "Logistics", amount: params.logistics },
    { id: "storage", label: "Storage", amount: params.storage },
    { id: "acceptance", label: "Acceptance", amount: params.acceptance },
    { id: "penalties", label: "Penalties", amount: params.penalties },
    { id: "adjustments", label: "Adjustments", amount: params.adjustments },
    { id: "productCost", label: "Product Cost", amount: params.productCost },
    { id: "advertising", label: "Advertising", amount: params.advertising },
    { id: "estimatedTax", label: "Estimated Tax", amount: params.estimatedTax },
    {
      id: "operatingProfit",
      label: "Operating Profit",
      amount: params.operatingProfit,
    },
    { id: "netProfit", label: "Net Profit", amount: params.netProfit, isTotal: true },
    {
      id: "netMargin",
      label: "Net Profit Margin %",
      amount: netMarginPercent,
      isPercent: true,
      isTotal: true,
    },
  ];
}

/** Account / brand P&L — identity projection of Dashboard Financial Engine. */
export function buildPnLFromModelB(
  fe: ModelBProfitMetrics,
  currency = "RUB"
): PnLReportView {
  const netProfit = fe.finalNetProfit;
  const operatingProfit = fe.operatingProfit ?? fe.netProfit;
  const lines = linesFromAmounts({
    grossSales: fe.grossSales,
    returnedSales: fe.returnedSales,
    netSales: fe.netSales,
    revenue: fe.revenue,
    marketplaceFees: fe.marketplaceFee ?? fe.commission,
    acquiring: fe.acquiring,
    logistics: fe.logistics,
    storage: fe.storage,
    acceptance: fe.acceptance,
    penalties: fe.penalties,
    adjustments: fe.adjustments,
    productCost: fe.productCost,
    advertising: fe.advertising,
    estimatedTax: fe.estimatedTax,
    operatingProfit,
    netProfit,
  });
  return {
    source: "financialEngine.modelB",
    currency,
    lines,
    netProfit,
    netMarginPercent: calculateModelBMarginPercent(fe.revenue, netProfit),
  };
}

/**
 * Category-filtered P&L — sums product rows already computed by the Financial Engine.
 * Does not invent formulas; aggregates engine outputs only.
 * Account-only fields (acquiring at product grain may be 0) stay as Σ product values.
 */
export function buildPnLFromProductRows(
  products: ProductProfitability[],
  currency = "RUB"
): PnLReportView {
  // Product rows carry no Gross/Returned Sales, so these stay 0 — see the loop
  // below, which deliberately does not derive them rather than invent a formula.
  const grossSales = 0;
  const returnedSales = 0;
  let netSales = 0;
  let revenue = 0;
  let marketplaceFees = 0;
  let logistics = 0;
  let storage = 0;
  // Acceptance is an account-level fee with no product grain; Σ product rows is 0.
  const acceptance = 0;
  let penalties = 0;
  let adjustments = 0;
  let productCost = 0;
  let advertising = 0;
  let operatingProfit = 0;
  let netProfit = 0;

  for (const row of products) {
    // Gross/returns not always on product row — derive when possible from netSales + return rate
    netSales += row.netSales;
    revenue += row.revenue;
    marketplaceFees += row.marketplaceFees;
    logistics += row.logistics + row.returnLogistics;
    storage += row.storage;
    penalties += row.penalties ?? 0;
    adjustments += row.accountAdjustments ?? 0;
    productCost += row.productCost;
    advertising += row.advertising;
    operatingProfit += row.netProfit;
    netProfit += row.finalNetProfit;
    // Product rows do not carry Gross/Returned Sales — leave 0 (no invented formula).
  }

  const estimatedTax = operatingProfit - netProfit;
  const lines = linesFromAmounts({
    grossSales,
    returnedSales,
    netSales,
    revenue,
    marketplaceFees,
    acquiring: 0,
    logistics,
    storage,
    acceptance,
    penalties,
    adjustments,
    productCost,
    advertising,
    estimatedTax,
    operatingProfit,
    netProfit,
  });

  return {
    source: "productRows.aggregated",
    currency,
    lines,
    netProfit,
    netMarginPercent: calculateModelBMarginPercent(revenue, netProfit),
  };
}

export function filterProductsByCategory(
  products: ProductProfitability[],
  categoryName: string | null | undefined
): ProductProfitability[] {
  if (!categoryName?.trim()) return products;
  const needle = categoryName.trim().toLowerCase();
  return products.filter((p) => (p.categoryName || "").trim().toLowerCase() === needle);
}

/** Chronological P&L breakdown row — FE metrics only for a sub-period. */
export type PnLPeriodBreakdownRow = {
  label: string;
  from: string;
  to: string;
  grossSales: number;
  returnedSales: number;
  netSales: number;
  revenue: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  productCost: number;
  estimatedTax: number;
  netProfit: number;
};

export function pnlPeriodRowFromModelB(
  label: string,
  from: string,
  to: string,
  fe: ModelBProfitMetrics
): PnLPeriodBreakdownRow {
  return {
    label,
    from,
    to,
    grossSales: fe.grossSales,
    returnedSales: fe.returnedSales,
    netSales: fe.netSales,
    revenue: fe.revenue,
    marketplaceFees: fe.marketplaceFee ?? fe.commission,
    logistics: fe.logistics,
    storage: fe.storage,
    productCost: fe.productCost,
    estimatedTax: fe.estimatedTax,
    netProfit: fe.finalNetProfit,
  };
}
