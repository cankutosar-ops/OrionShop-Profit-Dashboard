/** Gross profit: revenue minus product cost. */
export function calculateGrossProfit(revenue: number, productCost: number): number {
  return revenue - productCost;
}

export function calculateGrossProfitFromRow(row: {
  revenue: number;
  productCost: number;
}): number {
  return calculateGrossProfit(row.revenue, row.productCost);
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

/** WB finance deductions in the legacy other profit bucket (operation_type other + unclassified). */
export function calculateDeductions(otherExpenses: number): number {
  return otherExpenses;
}
