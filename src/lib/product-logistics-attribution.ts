import type { WbFinance, WbSale } from "@/types/database";

export type ProductLogisticsAttribution = {
  purchaseLogisticsRows: number;
  excludedLogisticsRows: number;
  /** Sum of excluded outbound logistics — visibility only, not in net profit. */
  excludedLogistics: number;
};

/** SRIDs of completed purchases (non-return sales) for a product in the selected period. */
export function buildPurchaseSridSet(sales: WbSale[]): Set<string> {
  const srids = new Set<string>();
  for (const sale of sales) {
    if (sale.is_return || !sale.srid) continue;
    srids.add(sale.srid);
  }
  return srids;
}

/**
 * Product profitability v2: outbound logistics only when SRID matches a completed purchase.
 * Return logistics and all other finance types are passed through unchanged.
 */
export function attributeProductFinance(
  finance: WbFinance[],
  purchaseSrids: Set<string>
): { financeForBreakdown: WbFinance[] } & ProductLogisticsAttribution {
  const financeForBreakdown: WbFinance[] = [];
  let purchaseLogisticsRows = 0;
  let excludedLogisticsRows = 0;
  let excludedLogistics = 0;

  for (const row of finance) {
    if (row.operation_type !== "logistics") {
      financeForBreakdown.push(row);
      continue;
    }

    if (row.srid && purchaseSrids.has(row.srid)) {
      financeForBreakdown.push(row);
      purchaseLogisticsRows += 1;
    } else {
      excludedLogisticsRows += 1;
      excludedLogistics += Math.abs(Number(row.amount));
    }
  }

  return {
    financeForBreakdown,
    purchaseLogisticsRows,
    excludedLogisticsRows,
    excludedLogistics,
  };
}
