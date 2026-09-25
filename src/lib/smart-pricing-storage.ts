import { rowMatchesFinanceCategory } from "@/lib/finance-category";
import type { WbFinance, WbSale } from "@/types/database";
import { sumCompletedSalesRevenue } from "@/lib/smart-pricing-marketplace-fees";

export type StorageTotals = {
  storage: number;
  unitsSold: number;
  unitsReturned?: number;
};

export function sumProductStorage(finance: WbFinance[]): number {
  return finance
    .filter((row) => rowMatchesFinanceCategory(row, "STORAGE"))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

export function sumProductStorageMetrics(sales: WbSale[], finance: WbFinance[]): StorageTotals {
  const { unitsSold } = sumCompletedSalesRevenue(sales);
  return {
    storage: sumProductStorage(finance),
    unitsSold,
    unitsReturned: sales.filter((row) => row.is_return).reduce((sum, row) => sum + row.quantity, 0),
  };
}

export function weightedStoragePerUnit(totals: StorageTotals): number | null {
  const netUnits = totals.unitsSold - (totals.unitsReturned ?? 0);
  if (netUnits <= 0) return null;
  return totals.storage / netUnits;
}

export function buildCategoryStorageTotals(
  products: { id: string; category_id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): Map<string, StorageTotals> {
  const byCategory = new Map<string, StorageTotals>();

  for (const product of products) {
    const categoryId = String(product.category_id);
    const productId = String(product.id);
    const metrics = sumProductStorageMetrics(
      salesByProductId.get(productId) ?? [],
      financeByProductId.get(productId) ?? []
    );

    const existing = byCategory.get(categoryId) ?? { storage: 0, unitsSold: 0 };

    byCategory.set(categoryId, {
      storage: existing.storage + metrics.storage,
      unitsSold: existing.unitsSold + metrics.unitsSold,
      unitsReturned: (existing.unitsReturned ?? 0) + (metrics.unitsReturned ?? 0),
    });
  }

  return byCategory;
}

export function buildAccountStorageTotals(
  products: { id: string }[],
  salesByProductId: Map<string, WbSale[]>,
  financeByProductId: Map<string, WbFinance[]>
): StorageTotals {
  const totals: StorageTotals = { storage: 0, unitsSold: 0 };

  for (const product of products) {
    const productId = String(product.id);
    const metrics = sumProductStorageMetrics(
      salesByProductId.get(productId) ?? [],
      financeByProductId.get(productId) ?? []
    );

    totals.storage += metrics.storage;
    totals.unitsSold += metrics.unitsSold;
    totals.unitsReturned = (totals.unitsReturned ?? 0) + (metrics.unitsReturned ?? 0);
  }

  return totals;
}
