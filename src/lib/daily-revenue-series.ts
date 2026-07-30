import { computeProductCost } from "@/lib/product-cost";
import { sumDailySalesAmount } from "@/lib/financial-engine";
import type { ProductCostHistory, WbSale } from "@/types/database";

function financeDate(value: string): string {
  return value.slice(0, 10);
}

export type DailyRevenuePoint = {
  date: string;
  /** Daily Sales = Σ priceWithDisc (Financial Engine). */
  revenue: number;
  /** Sales − product cost (gross contribution; not V4 Net Profit). */
  profit: number;
};

/**
 * Daily Sales trend (priceWithDisc) for the Revenue chart.
 * Uses Financial Engine Sales — never wb_sales.revenue (finishedPrice).
 */
export function groupSalesByDate(
  sales: WbSale[],
  costHistory: ProductCostHistory[],
  latestCostByProductId?: Map<string, number>
): DailyRevenuePoint[] {
  const dateMap = new Map<string, WbSale[]>();

  for (const sale of sales.filter((row) => !row.is_return)) {
    const date = financeDate(sale.sale_date);
    const existing = dateMap.get(date) ?? [];
    existing.push(sale);
    dateMap.set(date, existing);
  }

  return Array.from(dateMap.entries())
    .map(([date, daySales]) => {
      const revenue = sumDailySalesAmount(daySales);
      const productCost = computeProductCost(daySales, costHistory, latestCostByProductId);
      return { date, revenue, profit: revenue - productCost };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
