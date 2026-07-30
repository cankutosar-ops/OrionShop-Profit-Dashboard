/**
 * Financial Summary — direct Financial Engine V4 field projection.
 * Values must match Dashboard Commercial Performance (same Model B object).
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import { FINANCIAL_ENGINE_VERSION } from "@/lib/reporting/section-utils";
import type { ModelBProfitMetrics } from "@/types/database";

export type FinancialSummaryLine = {
  id: string;
  label: string;
  amount: number;
};

export type FinancialSummaryData = {
  engineVersion: typeof FINANCIAL_ENGINE_VERSION;
  /** Identity check: same object as ctx.financialEngine / overview.modelBProfit. */
  source: "financialEngine.modelB";
  lines: FinancialSummaryLine[];
  /** Full Model B passthrough for exporters that prefer the engine object. */
  modelB: ModelBProfitMetrics;
};

function linesFromModelB(fe: ModelBProfitMetrics): FinancialSummaryLine[] {
  return [
    { id: "grossSales", label: "Gross Sales", amount: fe.grossSales },
    { id: "returnedSales", label: "Returned Sales", amount: fe.returnedSales },
    { id: "netSales", label: "Net Sales", amount: fe.netSales },
    { id: "revenue", label: "Revenue", amount: fe.revenue },
    {
      id: "marketplaceFee",
      label: "Marketplace Fee",
      amount: fe.marketplaceFee ?? fe.commission,
    },
    { id: "productCost", label: "Product Cost", amount: fe.productCost },
    { id: "logistics", label: "Logistics", amount: fe.logistics },
    { id: "storage", label: "Storage", amount: fe.storage },
    { id: "acceptance", label: "Acceptance", amount: fe.acceptance },
    { id: "penalties", label: "Penalties", amount: fe.penalties },
    { id: "adjustments", label: "Adjustments", amount: fe.adjustments },
    { id: "acquiring", label: "Acquiring", amount: fe.acquiring },
    { id: "estimatedTax", label: "Estimated Tax", amount: fe.estimatedTax },
    {
      id: "operatingProfit",
      label: "Operating Profit",
      amount: fe.operatingProfit ?? fe.netProfit,
    },
    { id: "finalNetProfit", label: "Final Net Profit", amount: fe.finalNetProfit },
  ];
}

export function buildFinancialSummarySection(
  ctx: ReportContext
): ReportSection<FinancialSummaryData> {
  const fe = ctx.financialEngine;

  return {
    id: "financial-summary",
    kind: "financial-summary",
    title: "Financial Summary",
    description: "Financial Engine V4 Commercial Performance lines (Dashboard-aligned)",
    data: {
      engineVersion: FINANCIAL_ENGINE_VERSION,
      source: "financialEngine.modelB",
      lines: linesFromModelB(fe),
      modelB: fe,
    },
  };
}

/**
 * Assert financial summary lines equal Financial Engine fields (identity mapping).
 * Used by validation / tests — not a business calculation.
 */
export function validateFinancialSummaryAgainstEngine(
  data: FinancialSummaryData
): { ok: boolean; mismatches: string[] } {
  const fe = data.modelB;
  const expected = new Map(linesFromModelB(fe).map((l) => [l.id, l.amount]));
  const mismatches: string[] = [];
  for (const line of data.lines) {
    const exp = expected.get(line.id);
    if (exp === undefined || exp !== line.amount) {
      mismatches.push(line.id);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
