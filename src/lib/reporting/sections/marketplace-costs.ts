/**
 * Marketplace Cost Analysis — FE V4 cost lines with % of Revenue.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import { percentOfRevenue } from "@/lib/reporting/section-utils";

export type MarketplaceCostLine = {
  id: string;
  label: string;
  amount: number;
  percentOfRevenue: number;
};

export type MarketplaceCostsData = {
  revenueBase: number;
  lines: MarketplaceCostLine[];
  totalAmount: number;
  totalPercentOfRevenue: number;
};

export function buildMarketplaceCostsSection(
  ctx: ReportContext
): ReportSection<MarketplaceCostsData> {
  const fe = ctx.financialEngine;
  const revenue = fe.revenue;

  const rawLines: Array<{ id: string; label: string; amount: number }> = [
    {
      id: "marketplaceFee",
      label: "Marketplace Fee",
      amount: fe.marketplaceFee ?? fe.commission,
    },
    { id: "logistics", label: "Logistics", amount: fe.logistics },
    { id: "storage", label: "Storage", amount: fe.storage },
    { id: "acceptance", label: "Acceptance", amount: fe.acceptance },
    { id: "penalties", label: "Penalties", amount: fe.penalties },
    { id: "adjustments", label: "Adjustments", amount: fe.adjustments },
    { id: "acquiring", label: "Acquiring", amount: fe.acquiring },
    { id: "estimatedTax", label: "Estimated Tax", amount: fe.estimatedTax },
  ];

  const lines = rawLines.map((line) => ({
    ...line,
    percentOfRevenue: percentOfRevenue(line.amount, revenue),
  }));

  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    id: "marketplace-costs",
    kind: "marketplace-costs",
    title: "Marketplace Cost Analysis",
    description: "Marketplace expense breakdown with share of Revenue (Financial Engine V4)",
    data: {
      revenueBase: revenue,
      lines,
      totalAmount,
      totalPercentOfRevenue: percentOfRevenue(totalAmount, revenue),
    },
  };
}
