import type { InventoryIntelligenceSkuRow } from "@/lib/inventory-intelligence-types";

export type DistributionTotals = {
  orders: number;
  units: number;
  revenue: number;
};

/** Sum period metrics already present on warehouseDistribution rows. */
export function totalsFromDistribution(
  row: Pick<InventoryIntelligenceSkuRow, "warehouseDistribution">
): DistributionTotals {
  let orders = 0;
  let units = 0;
  let revenue = 0;
  for (const wh of row.warehouseDistribution) {
    orders += wh.orders;
    units += wh.unitsSold;
    revenue += wh.revenue;
  }
  return { orders, units, revenue };
}
