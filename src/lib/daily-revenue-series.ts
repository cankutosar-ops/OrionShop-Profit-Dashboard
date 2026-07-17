import { computeProductCost } from "@/lib/product-cost";
import type { ProductCostHistory, WbSale } from "@/types/database";

function financeDate(value: string): string {
  return value.slice(0, 10);
}

export type DailyRevenuePoint = {
  date: string;
  revenue: number;
  profit: number;
};

/** Daily revenue trend with gross profit (revenue − product cost) per day. */
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
      const revenue = daySales.reduce((sum, sale) => sum + sale.revenue, 0);
      const productCost = computeProductCost(daySales, costHistory, latestCostByProductId);
      return { date, revenue, profit: revenue - productCost };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
