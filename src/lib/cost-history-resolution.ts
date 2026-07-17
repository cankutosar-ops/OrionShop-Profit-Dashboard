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

function normalizeSupplierArticle(article: string): string {
  return article.trim();
}

function toValidUnitCost(value: unknown): number | null {
  const cost = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(cost) || cost < 0) return null;
  return cost;
}

/**
 * Latest active unit cost per product_id.
 *
 * 1. Prefer each product's own latest `product_cost_history` row (Cost Management parity).
 * 2. Fill siblings that share the same trimmed supplier_article from a product that has a cost.
 */
export function buildLatestCostByProductId(
  costHistory: ProductCostHistory[],
  products: { id: string; supplier_article: string }[]
): Map<string, number> {
  const byProductId = new Map<string, number>();
  const productById = new Map(
    products.map((product) => [String(product.id), product] as const)
  );

  // 1) Authoritative per-product latest cost (same basis as Cost Management).
  const latestByProduct = pickLatestCostHistoryByProductId(costHistory);
  for (const [productId, row] of latestByProduct) {
    if (!productById.has(productId)) continue;
    const cost = toValidUnitCost(row.cost);
    if (cost !== null) {
      byProductId.set(productId, cost);
    }
  }

  // 2) Share latest cost across identical supplier articles (trimmed).
  const latestByArticle = new Map<string, { cost: number; row: ProductCostHistory }>();
  for (const [productId, cost] of byProductId) {
    const product = productById.get(productId);
    if (!product) continue;
    const article = normalizeSupplierArticle(product.supplier_article);
    if (!article) continue;
    const row = latestByProduct.get(productId);
    if (!row) continue;
    const current = latestByArticle.get(article);
    if (!current || isMoreRecentCostHistory(row, current.row)) {
      latestByArticle.set(article, { cost, row });
    }
  }

  for (const product of products) {
    const productId = String(product.id);
    if (byProductId.has(productId)) continue;
    const article = normalizeSupplierArticle(product.supplier_article);
    if (!article) continue;
    const shared = latestByArticle.get(article);
    if (shared) {
      byProductId.set(productId, shared.cost);
    }
  }

  return byProductId;
}
