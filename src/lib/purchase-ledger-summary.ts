/**
 * Purchases ledger presentation aggregates — pure, no I/O.
 */

import type { PurchaseListItem } from "@/types/database";

export type PurchaseLedgerSummary = {
  totalPurchases: number;
  totalPurchaseValue: number;
  productsUpdated: number;
  lastImportAt: string | null;
};

export function buildPurchaseLedgerSummary(
  purchases: PurchaseListItem[]
): PurchaseLedgerSummary {
  const articles = new Set<string>();
  let totalPurchaseValue = 0;
  let lastImportAt: string | null = null;

  for (const purchase of purchases) {
    totalPurchaseValue += purchase.total_cost;
    if (!lastImportAt || purchase.created_at > lastImportAt) {
      lastImportAt = purchase.created_at;
    }
    for (const article of purchase.supplierArticles) {
      articles.add(article.toLowerCase());
    }
  }

  return {
    totalPurchases: purchases.length,
    totalPurchaseValue,
    productsUpdated: articles.size,
    lastImportAt,
  };
}
