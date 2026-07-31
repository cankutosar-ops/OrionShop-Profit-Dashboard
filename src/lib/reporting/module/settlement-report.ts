/**
 * Sprint 9.2 — Settlement Report projection from Financial Engine V4.
 * Presentation only — maps engine / overview settlement fields; never recalculates.
 *
 * Net Transfer = Model B sellerPayout =
 *   Revenue − Logistics − Storage − Acceptance − Penalties − Other (adjustments)
 */

import type { ModelBProfitMetrics, OverviewMetrics, ProductProfitability } from "@/types/database";
import { filterProductsByCategory } from "@/lib/reporting/module/pnl-report";

export type SettlementLineId =
  | "grossSales"
  | "returns"
  | "netSales"
  | "revenue"
  | "marketplaceFees"
  | "logistics"
  | "returnLogistics"
  | "storage"
  | "acceptance"
  | "penalties"
  | "otherDeductions"
  | "netTransfer";

export type SettlementSection = "sales" | "wb" | "costs" | "result";

export type SettlementLine = {
  id: SettlementLineId;
  label: string;
  amount: number;
  section: SettlementSection;
  isTotal?: boolean;
};

export type SettlementReportView = {
  source: "financialEngine.modelB" | "productRows.aggregated";
  currency: string;
  lines: SettlementLine[];
  /** Primary KPI — Financial Engine sellerPayout. */
  netTransfer: number;
};

export type SettlementEngineSlice = {
  grossSales: number;
  returnedSales: number;
  netSales: number;
  revenue: number;
  marketplaceFees: number;
  /** Outbound logistics (excludes return logistics when split is available). */
  logistics: number;
  returnLogistics: number;
  storage: number;
  acceptance: number;
  penalties: number;
  otherDeductions: number;
  /** Engine sellerPayout — Net Transfer. */
  netTransfer: number;
};

function linesFromSlice(slice: SettlementEngineSlice): SettlementLine[] {
  return [
    { id: "grossSales", label: "Gross Sales", amount: slice.grossSales, section: "sales" },
    { id: "returns", label: "Returns", amount: slice.returnedSales, section: "sales" },
    { id: "netSales", label: "Net Sales", amount: slice.netSales, section: "sales" },
    {
      id: "revenue",
      label: "Revenue (Settlement / For Pay)",
      amount: slice.revenue,
      section: "wb",
    },
    {
      id: "marketplaceFees",
      label: "Marketplace Fees",
      amount: slice.marketplaceFees,
      section: "wb",
    },
    { id: "logistics", label: "Logistics", amount: slice.logistics, section: "costs" },
    {
      id: "returnLogistics",
      label: "Return Logistics",
      amount: slice.returnLogistics,
      section: "costs",
    },
    { id: "storage", label: "Storage", amount: slice.storage, section: "costs" },
    { id: "acceptance", label: "Acceptance", amount: slice.acceptance, section: "costs" },
    { id: "penalties", label: "Penalties", amount: slice.penalties, section: "costs" },
    {
      id: "otherDeductions",
      label: "Other Deductions",
      amount: slice.otherDeductions,
      section: "costs",
    },
    {
      id: "netTransfer",
      label: "Net Transfer",
      amount: slice.netTransfer,
      section: "result",
      isTotal: true,
    },
  ];
}

/**
 * Account / brand settlement from Financial Engine + overview logistics split.
 * Net Transfer is always `fe.sellerPayout` (engine identity).
 */
export function buildSettlementFromEngine(
  fe: ModelBProfitMetrics,
  overview: Pick<OverviewMetrics, "logistics" | "returnLogistics" | "otherExpenses">,
  currency = "RUB"
): SettlementReportView {
  const outbound = overview.logistics;
  const returnLogistics = overview.returnLogistics;
  // Engine logistics is outbound + return; prefer overview split when it reconciles.
  const splitOk =
    Math.abs(outbound + returnLogistics - fe.logistics) < 0.02 ||
    Math.abs(outbound + returnLogistics) < 0.02;

  const slice: SettlementEngineSlice = {
    grossSales: fe.grossSales,
    returnedSales: fe.returnedSales,
    netSales: fe.netSales,
    revenue: fe.revenue,
    marketplaceFees: fe.marketplaceFee ?? fe.commission,
    logistics: splitOk ? outbound : fe.logistics,
    returnLogistics: splitOk ? returnLogistics : 0,
    storage: fe.storage,
    acceptance: fe.acceptance,
    penalties: fe.penalties,
    otherDeductions: fe.adjustments,
    netTransfer: fe.sellerPayout,
  };

  return {
    source: "financialEngine.modelB",
    currency,
    lines: linesFromSlice(slice),
    netTransfer: fe.sellerPayout,
  };
}

/**
 * Category-filtered settlement — aggregates product rows already produced by the engine.
 * Gross/Returns/Acceptance may be 0 when unavailable at product grain (rows kept).
 * Net Transfer = Revenue − logistics − return logistics − storage − penalties − other
 * (mirrors sellerPayout components available on product rows; acceptance stays 0).
 */
export function buildSettlementFromProductRows(
  products: ProductProfitability[],
  currency = "RUB"
): SettlementReportView {
  let netSales = 0;
  let revenue = 0;
  let marketplaceFees = 0;
  let logistics = 0;
  let returnLogistics = 0;
  let storage = 0;
  let penalties = 0;
  let otherDeductions = 0;

  for (const row of products) {
    netSales += row.netSales;
    revenue += row.revenue;
    marketplaceFees += row.marketplaceFees;
    logistics += row.logistics;
    returnLogistics += row.returnLogistics;
    storage += row.storage;
    penalties += row.penalties;
    otherDeductions += row.otherExpenses;
  }

  const acceptance = 0;
  const netTransfer =
    revenue - logistics - returnLogistics - storage - acceptance - penalties - otherDeductions;

  const slice: SettlementEngineSlice = {
    grossSales: 0,
    returnedSales: 0,
    netSales,
    revenue,
    marketplaceFees,
    logistics,
    returnLogistics,
    storage,
    acceptance,
    penalties,
    otherDeductions,
    netTransfer,
  };

  return {
    source: "productRows.aggregated",
    currency,
    lines: linesFromSlice(slice),
    netTransfer,
  };
}

export function buildSettlementReport(params: {
  fe: ModelBProfitMetrics;
  overview: OverviewMetrics;
  products: ProductProfitability[];
  category?: string;
  currency?: string;
}): SettlementReportView {
  const currency = params.currency ?? "RUB";
  if (params.category?.trim()) {
    const filtered = filterProductsByCategory(params.products, params.category);
    return buildSettlementFromProductRows(filtered, currency);
  }
  return buildSettlementFromEngine(params.fe, params.overview, currency);
}

export { filterProductsByCategory };
