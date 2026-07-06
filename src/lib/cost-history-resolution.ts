import type { ProductCostHistory } from "@/types/database";

/** Compare two cost history rows; positive means `a` is more recent than `b`. */
export function compareLatestCostHistory(
  a: ProductCostHistory,
  b: ProductCostHistory
): number {
  const byEffectiveFrom = a.effective_from.localeCompare(b.effective_from);
  if (byEffectiveFrom !== 0) return byEffectiveFrom;

  const byCreatedAt = a.created_at.localeCompare(b.created_at);
  if (byCreatedAt !== 0) return byCreatedAt;

  const idA = BigInt(a.id);
  const idB = BigInt(b.id);
  if (idA > idB) return 1;
  if (idA < idB) return -1;
  return 0;
}

export function isMoreRecentCostHistory(
  candidate: ProductCostHistory,
  current: ProductCostHistory
): boolean {
  return compareLatestCostHistory(candidate, current) > 0;
}

/** Latest row per product_id using effective_from → created_at → id. */
export function pickLatestCostHistoryByProductId<T extends ProductCostHistory>(
  rows: T[]
): Map<string, T> {
  const byProduct = new Map<string, T>();

  for (const row of rows) {
    const productId = String(row.product_id);
    const current = byProduct.get(productId);
    if (!current || isMoreRecentCostHistory(row, current)) {
      byProduct.set(productId, row);
    }
  }

  return byProduct;
}

/** Latest cost per supplier_article, mapped to each product_id. */
export function buildLatestCostByProductId(
  costHistory: ProductCostHistory[],
  products: { id: string; supplier_article: string }[]
): Map<string, number> {
  const latestByArticle = new Map<string, ProductCostHistory>();

  for (const entry of costHistory) {
    const product = products.find((p) => String(p.id) === String(entry.product_id));
    if (!product) continue;

    const article = product.supplier_article;
    const current = latestByArticle.get(article);
    if (!current || isMoreRecentCostHistory(entry, current)) {
      latestByArticle.set(article, entry);
    }
  }

  const byProductId = new Map<string, number>();
  for (const product of products) {
    const latest = latestByArticle.get(product.supplier_article);
    if (latest) {
      byProductId.set(String(product.id), latest.cost);
    }
  }

  return byProductId;
}
