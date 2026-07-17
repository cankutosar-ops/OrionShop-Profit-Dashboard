import type { ProductCostHistory, WbSale } from "@/types/database";

export function getProductCostAtDate(
  costHistory: ProductCostHistory[],
  date: string
): number {
  const applicable = costHistory
    .filter((c) => c.effective_from <= date && (!c.effective_to || c.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));

  return applicable[0]?.cost ?? 0;
}

function resolveUnitCost(
  sale: WbSale,
  costHistory: ProductCostHistory[],
  latestCostByProductId?: Map<string, number>
): number {
  const latest = latestCostByProductId?.get(String(sale.product_id));
  if (latest !== undefined) return latest;
  return getProductCostAtDate(costHistory, sale.sale_date);
}

export function computeProductCost(
  sales: WbSale[],
  costHistory: ProductCostHistory[],
  latestCostByProductId?: Map<string, number>
): number {
  return sales.reduce((sum, sale) => {
    const unitCost = resolveUnitCost(sale, costHistory, latestCostByProductId);
    const sign = sale.is_return ? -1 : 1;
    return sum + sign * unitCost * sale.quantity;
  }, 0);
}
