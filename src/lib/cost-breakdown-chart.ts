const COST_COLORS = {
  productCost: "#ef4444",
  commission: "#f59e0b",
  logistics: "#6366f1",
  returnLogistics: "#8b5cf6",
  storage: "#06b6d4",
  advertising: "#ec4899",
  penalties: "#dc2626",
  otherExpenses: "#71717a",
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
