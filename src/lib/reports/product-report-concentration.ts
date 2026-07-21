/** Minimal product row needed for share-of-total concentration (presentation). */
export type PortfolioConcentrationSourceRow = {
  sku: string;
  productName: string;
  revenue: number;
  profit: number;
};

export type PortfolioConcentrationProduct = PortfolioConcentrationSourceRow & {
  revenueSharePercent: number;
  profitSharePercent: number;
};

/**
 * Portfolio concentration from the Product Performance dataset already in the payload.
 * Presentation only: share = part ÷ total (same pattern as existing executive insights).
 */
export type PortfolioConcentration = {
  top5Products: PortfolioConcentrationProduct[];
  top5RevenueSharePercent: number;
  top5ProfitSharePercent: number;
  topProductRevenueSharePercent: number;
  topProductProfitSharePercent: number;
};

function sharePercent(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / Math.abs(total)) * 100;
}

/**
 * Derive concentration metrics from performance rows already loaded for the report.
 * Returns null when there is no revenue/profit base to express shares against.
 */
export function buildPortfolioConcentration(
  rows: PortfolioConcentrationSourceRow[]
): PortfolioConcentration | null {
  if (rows.length === 0) return null;

  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const totalProfit = rows.reduce((sum, row) => sum + row.profit, 0);

  if (totalRevenue === 0 && totalProfit === 0) return null;

  const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue);
  const top5 = byRevenue.slice(0, 5);
  const top5Revenue = top5.reduce((sum, row) => sum + row.revenue, 0);
  const top5Profit = top5.reduce((sum, row) => sum + row.profit, 0);

  const topByProfit = [...rows].sort((a, b) => b.profit - a.profit)[0];
  const topByRevenue = byRevenue[0];

  return {
    top5Products: top5.map((row) => ({
      sku: row.sku,
      productName: row.productName,
      revenue: row.revenue,
      profit: row.profit,
      revenueSharePercent: sharePercent(row.revenue, totalRevenue),
      profitSharePercent: sharePercent(row.profit, totalProfit),
    })),
    top5RevenueSharePercent: sharePercent(top5Revenue, totalRevenue),
    top5ProfitSharePercent: sharePercent(top5Profit, totalProfit),
    topProductRevenueSharePercent: topByRevenue
      ? sharePercent(topByRevenue.revenue, totalRevenue)
      : 0,
    topProductProfitSharePercent: topByProfit
      ? sharePercent(topByProfit.profit, totalProfit)
      : 0,
  };
}

/** Marketplace cost composition slices from existing report totals (presentation). */
export type MarketplaceCostCompositionSlice = {
  name: string;
  value: number;
};

export function buildMarketplaceCostComposition(totals: {
  commission: number;
  logistics: number;
  storage: number;
  advertising: number;
  otherMarketplaceCosts: number;
}): MarketplaceCostCompositionSlice[] {
  return [
    { name: "Commission", value: totals.commission },
    { name: "Logistics", value: totals.logistics },
    { name: "Storage", value: totals.storage },
    { name: "Advertising", value: totals.advertising },
    { name: "Other Marketplace Costs", value: totals.otherMarketplaceCosts },
  ];
}
