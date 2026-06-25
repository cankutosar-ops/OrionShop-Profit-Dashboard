import type { ProfitBreakdown, ProfitabilityV2Metrics } from "@/types/database";

/** WB finance deductions (operation_type other + unclassified). */
export function calculateDeductions(breakdown: ProfitBreakdown): number {
  return breakdown.otherExpenses;
}

/** Marketplace fees = commission + deductions (penalties shown separately). */
export function calculateMarketplaceFees(breakdown: ProfitBreakdown): number {
  return breakdown.commission + calculateDeductions(breakdown);
}

export function calculateMarketplaceFeesFromParts(commission: number, otherExpenses: number): number {
  return commission + otherExpenses;
}

export function calculateGrossProfit(breakdown: ProfitBreakdown): number {
  return breakdown.revenue - breakdown.productCost;
}

export function calculateGrossMarginPercent(revenue: number, grossProfit: number): number {
  if (revenue <= 0) return 0;
  return (grossProfit / revenue) * 100;
}

/** Net margin: net profit ÷ revenue × 100. */
export function calculateNetMarginPercent(revenue: number, netProfit: number): number {
  if (revenue <= 0) return 0;
  return (netProfit / revenue) * 100;
}

/**
 * Profitability V2 reporting derived from the existing net-profit breakdown.
 * Product cost uses latest active cost × sold quantity (via buildProfitBreakdown).
 * Net profit formula is unchanged; advertising is deducted separately (wb_ads).
 */
export function buildProfitabilityV2(breakdown: ProfitBreakdown): ProfitabilityV2Metrics {
  const grossProfit = calculateGrossProfit(breakdown);
  const marketplaceFees = calculateMarketplaceFees(breakdown);
  const marginPercent = calculateGrossMarginPercent(breakdown.revenue, grossProfit);

  return {
    productCost: breakdown.productCost,
    grossProfit,
    marketplaceFees,
    marginPercent,
    advertising: breakdown.advertising,
    breakdown: [
      { key: "revenue", label: "Revenue", amount: breakdown.revenue },
      {
        key: "productCost",
        label: "Product Cost",
        amount: breakdown.productCost,
        isDeduction: true,
        detail: "Latest active cost × sold quantity",
      },
      {
        key: "marketplaceFees",
        label: "Marketplace Fees",
        amount: marketplaceFees,
        isDeduction: true,
        detail: "Commission + deductions",
      },
      { key: "logistics", label: "Logistics", amount: breakdown.logistics, isDeduction: true },
      { key: "storage", label: "Storage", amount: breakdown.storage, isDeduction: true },
      {
        key: "returnLogistics",
        label: "Return Logistics",
        amount: breakdown.returnLogistics,
        isDeduction: true,
      },
      { key: "penalty", label: "Penalty", amount: breakdown.penalties, isDeduction: true },
      { key: "netProfit", label: "Net Profit", amount: breakdown.netProfit, isTotal: true },
    ],
  };
}
