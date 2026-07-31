/**
 * Sprint 9.1 — Profit & Loss report projection from Financial Engine V4.
 * Never recalculates business math — maps Model B / product engine outputs only.
 */

import { calculateModelBMarginPercent } from "@/lib/financial-engine";
import type { ModelBProfitMetrics, ProductProfitability } from "@/types/database";

export type PnLLineId =
  | "netSales"
  | "revenue"
  | "marketplaceFees"
  | "logistics"
  | "storage"
  | "productCost"
  | "advertising"
  | "estimatedTax"
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
  netSales: number;
  revenue: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  productCost: number;
  advertising: number;
  estimatedTax: number;
  netProfit: number;
}): PnLLine[] {
  const netMarginPercent = calculateModelBMarginPercent(params.revenue, params.netProfit);
  return [
    { id: "netSales", label: "Net Sales", amount: params.netSales },
    { id: "revenue", label: "Revenue (WB Settlement)", amount: params.revenue },
    { id: "marketplaceFees", label: "Marketplace Fees", amount: params.marketplaceFees },
    { id: "logistics", label: "Logistics", amount: params.logistics },
    { id: "storage", label: "Storage", amount: params.storage },
    { id: "productCost", label: "Product Cost", amount: params.productCost },
    { id: "advertising", label: "Advertising", amount: params.advertising },
    { id: "estimatedTax", label: "Estimated Tax", amount: params.estimatedTax },
    { id: "netProfit", label: "Net Profit", amount: params.netProfit, isTotal: true },
    {
      id: "netMargin",
      label: "Net Margin %",
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
  const lines = linesFromAmounts({
    netSales: fe.netSales,
    revenue: fe.revenue,
    marketplaceFees: fe.marketplaceFee ?? fe.commission,
    logistics: fe.logistics,
    storage: fe.storage,
    productCost: fe.productCost,
    advertising: fe.advertising,
    estimatedTax: fe.estimatedTax,
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
 */
export function buildPnLFromProductRows(
  products: ProductProfitability[],
  currency = "RUB"
): PnLReportView {
  let netSales = 0;
  let revenue = 0;
  let marketplaceFees = 0;
  let logistics = 0;
  let storage = 0;
  let productCost = 0;
  let advertising = 0;
  let operatingProfit = 0;
  let netProfit = 0;

  for (const row of products) {
    netSales += row.netSales;
    revenue += row.revenue;
    marketplaceFees += row.marketplaceFees;
    logistics += row.logistics + row.returnLogistics;
    storage += row.storage;
    productCost += row.productCost;
    advertising += row.advertising;
    operatingProfit += row.netProfit;
    netProfit += row.finalNetProfit;
  }

  const estimatedTax = operatingProfit - netProfit;
  const lines = linesFromAmounts({
    netSales,
    revenue,
    marketplaceFees,
    logistics,
    storage,
    productCost,
    advertising,
    estimatedTax,
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
  categoryIdOrName: string | null | undefined
): ProductProfitability[] {
  const key = categoryIdOrName?.trim();
  if (!key) return products;
  return products.filter(
    (p) => p.categoryName === key || p.categoryName.toLowerCase() === key.toLowerCase()
  );
}
