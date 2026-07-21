import { CHART_COLOR_FALLBACKS } from "@/lib/chart-theme";

/**
 * Cost breakdown slice colors — Wave 1 chart tokens (presentation only).
 * Values come from dashboard Model B aggregates via buildCostBreakdown.
 */
const COST_COLORS = {
  productCost: CHART_COLOR_FALLBACKS[4],
  commission: CHART_COLOR_FALLBACKS[3],
  logistics: CHART_COLOR_FALLBACKS[0],
  returnLogistics: CHART_COLOR_FALLBACKS[1],
  storage: CHART_COLOR_FALLBACKS[5],
  advertising: CHART_COLOR_FALLBACKS[2],
  penalties: CHART_COLOR_FALLBACKS[4],
  otherExpenses: CHART_COLOR_FALLBACKS[1],
} as const;

export type CostBreakdownSlice = {
  name: string;
  value: number;
  color: string;
};

export function buildCostBreakdown(params: {
  productCost: number;
  marketplaceFees: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  penalties: number;
}): CostBreakdownSlice[] {
  return [
    { name: "Product Cost", value: params.productCost, color: COST_COLORS.productCost },
    {
      name: "Marketplace Fees",
      value: params.marketplaceFees,
      color: COST_COLORS.commission,
    },
    { name: "Logistics", value: params.logistics, color: COST_COLORS.logistics },
    {
      name: "Return Logistics",
      value: params.returnLogistics,
      color: COST_COLORS.returnLogistics,
    },
    { name: "Storage", value: params.storage, color: COST_COLORS.storage },
    { name: "Advertising", value: params.advertising, color: COST_COLORS.advertising },
    { name: "Penalties", value: params.penalties, color: COST_COLORS.penalties },
  ].filter((item) => item.value > 0);
}

export { COST_COLORS };
