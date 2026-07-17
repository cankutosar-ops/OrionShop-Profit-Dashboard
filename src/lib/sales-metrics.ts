import type { WbSale } from "@/types/database";

export function calculateReturnRate(unitsSold: number, unitsReturned: number): number {
  const total = unitsSold + unitsReturned;
  if (total === 0) return 0;
  return (unitsReturned / total) * 100;
}

export type SalesQuantityMetrics = {
  revenue: number;
  unitsSold: number;
  unitsReturned: number;
  returnRate: number;
};

export function aggregateSalesMetrics(sales: WbSale[]): SalesQuantityMetrics {
  const completedSales = sales.filter((sale) => !sale.is_return);
  const returns = sales.filter((sale) => sale.is_return);
  const revenue = completedSales.reduce((sum, sale) => sum + sale.revenue, 0);
  const unitsSold = completedSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const unitsReturned = returns.reduce((sum, sale) => sum + sale.quantity, 0);

  return {
    revenue,
    unitsSold,
    unitsReturned,
    returnRate: calculateReturnRate(unitsSold, unitsReturned),
  };
}
