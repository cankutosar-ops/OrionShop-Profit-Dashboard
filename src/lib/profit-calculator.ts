import type {
  ProductCostHistory,
  ProfitBreakdown,
  WbAd,
  WbFinance,
  WbSale,
} from "@/types/database";

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

export function calculateNetProfit(components: {
  revenue: number;
  productCost: number;
  commission: number;
  logistics: number;
  returnLogistics: number;
  storage: number;
  advertising: number;
  penalties: number;
  otherExpenses: number;
}): number {
  return (
    components.revenue -
    components.productCost -
    components.commission -
    components.logistics -
    components.returnLogistics -
    components.storage -
    components.advertising -
    components.penalties -
    components.otherExpenses
  );
}

export function calculateReturnRate(unitsSold: number, unitsReturned: number): number {
  const total = unitsSold + unitsReturned;
  if (total === 0) return 0;
  return (unitsReturned / total) * 100;
}

export function sumFinanceByType(
  financeRecords: WbFinance[],
  type: WbFinance["operation_type"]
): number {
  return financeRecords
    .filter((r) => r.operation_type === type)
    .reduce((sum, r) => sum + Math.abs(r.amount), 0);
}

export function getProductCostAtDate(
  costHistory: ProductCostHistory[],
  date: string
): number {
  const applicable = costHistory
    .filter((c) => c.effective_from <= date && (!c.effective_to || c.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  return applicable[0]?.cost ?? 0;
}

export function buildProfitBreakdown(params: {
  sales: WbSale[];
  finance: WbFinance[];
  ads: WbAd[];
  costHistory: ProductCostHistory[];
}): ProfitBreakdown {
  const { sales, finance, ads, costHistory } = params;

  const completedSales = sales.filter((s) => !s.is_return);
  const returns = sales.filter((s) => s.is_return);

  const revenue = completedSales.reduce((sum, s) => sum + s.revenue, 0);
  const unitsSold = completedSales.reduce((sum, s) => sum + s.quantity, 0);
  const unitsReturned = returns.reduce((sum, s) => sum + s.quantity, 0);

  const productCost = completedSales.reduce((sum, sale) => {
    const unitCost = getProductCostAtDate(costHistory, sale.sale_date);
    return sum + unitCost * sale.quantity;
  }, 0);

  const commission = sumFinanceByType(finance, "commission");
  const logistics = sumFinanceByType(finance, "logistics");
  const returnLogistics = sumFinanceByType(finance, "return_logistics");
  const storage = sumFinanceByType(finance, "storage");
  const penalties = sumFinanceByType(finance, "penalty");
  const otherExpenses = sumFinanceByType(finance, "other");
  const advertising = ads.reduce((sum, ad) => sum + ad.spend, 0);

  const netProfit = calculateNetProfit({
    revenue,
    productCost,
    commission,
    logistics,
    returnLogistics,
    storage,
    advertising,
    penalties,
    otherExpenses,
  });

  return {
    revenue,
    productCost,
    commission,
    logistics,
    returnLogistics,
    storage,
    advertising,
    penalties,
    otherExpenses,
    netProfit,
    returnRate: calculateReturnRate(unitsSold, unitsReturned),
    unitsSold,
    unitsReturned,
  };
}

export function buildCostBreakdown(breakdown: ProfitBreakdown) {
  return [
    { name: "Product Cost", value: breakdown.productCost, color: COST_COLORS.productCost },
    { name: "Commission", value: breakdown.commission, color: COST_COLORS.commission },
    { name: "Logistics", value: breakdown.logistics, color: COST_COLORS.logistics },
    {
      name: "Return Logistics",
      value: breakdown.returnLogistics,
      color: COST_COLORS.returnLogistics,
    },
    { name: "Storage", value: breakdown.storage, color: COST_COLORS.storage },
    { name: "Advertising", value: breakdown.advertising, color: COST_COLORS.advertising },
    { name: "Penalties", value: breakdown.penalties, color: COST_COLORS.penalties },
    { name: "Other", value: breakdown.otherExpenses, color: COST_COLORS.otherExpenses },
  ].filter((item) => item.value > 0);
}

export function groupSalesByDate(
  sales: WbSale[],
  costHistory: ProductCostHistory[],
  finance: WbFinance[]
): { date: string; revenue: number; profit: number }[] {
  const dateMap = new Map<string, { revenue: number; sales: WbSale[] }>();

  for (const sale of sales.filter((s) => !s.is_return)) {
    const date = sale.sale_date;
    const existing = dateMap.get(date) ?? { revenue: 0, sales: [] };
    existing.revenue += sale.revenue;
    existing.sales.push(sale);
    dateMap.set(date, existing);
  }

  return Array.from(dateMap.entries())
    .map(([date, data]) => {
      const dayFinance = finance.filter((f) => f.operation_date === date);
      const dayBreakdown = buildProfitBreakdown({
        sales: data.sales,
        finance: dayFinance,
        ads: [],
        costHistory,
      });
      return { date, revenue: data.revenue, profit: dayBreakdown.netProfit };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export { COST_COLORS };
