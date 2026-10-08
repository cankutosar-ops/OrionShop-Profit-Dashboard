import type { WbFinance } from "@/types/database";
import { rollupCategoriesToProfitBuckets, summarizeFinanceByCategory } from "@/lib/finance-rollup";

/** NULL product links are not evidence of membership in the selected brand. */
export function partitionDashboardFinance(rows: WbFinance[], brandSelected: boolean) {
  return brandSelected
    ? { finance: rows.filter(row => row.product_id != null), unallocatedFinance: rows.filter(row => row.product_id == null) }
    : { finance: rows, unallocatedFinance: [] as WbFinance[] };
}

export function summarizeUnallocatedDashboardFinance(rows: WbFinance[]) {
  const buckets = rollupCategoriesToProfitBuckets(rows);
  const categories = summarizeFinanceByCategory(rows);
  return {
    rows: rows.length,
    logistics: buckets.logistics + buckets.return_logistics,
    storage: buckets.storage,
    penalties: buckets.penalty,
    adjustments: categories.ADJUSTMENT,
  };
}

export type BrandFinanceNotice = ReturnType<typeof summarizeUnallocatedDashboardFinance>;
