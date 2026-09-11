/**
 * Product-level logistics attribution.
 *
 * Outbound LOGISTICS rows often arrive with product_id NULL. Resolve them onto
 * products using SRID → wb_sales, then unambiguous nm_id → products — never by
 * revenue/unit percentage allocation.
 *
 * Eligibility for Net Profit is unchanged: only logistics whose SRID matches a
 * completed (non-return) purchase SRID for that product are deducted.
 */

import { rowMatchesFinanceCategory } from "@/lib/finance-category";
import type { WbFinance, WbSale } from "@/types/database";

export type ProductLogisticsAttribution = {
  purchaseLogisticsRows: number;
  excludedLogisticsRows: number;
  /** Sum of excluded outbound logistics — visibility only, not in net profit. */
  excludedLogistics: number;
};

export type LogisticsResolveMethod = "existing_product_id" | "srid" | "nm_id" | "unresolved";

export type ProductLogisticsReconciliation = {
  /** Account Σ |amount| for LOGISTICS category in the loaded finance set. */
  accountLogisticsTotal: number;
  /** Σ product purchaseLogistics (eligible, in Net Profit). */
  attributedProductLogistics: number;
  /**
   * Account total − attributed. Includes unresolved rows and rows that resolved
   * to a product but failed the purchase-SRID eligibility gate.
   */
  unallocatedLogistics: number;
  resolvedViaSridAbs: number;
  resolvedViaNmIdAbs: number;
  unresolvedAbs: number;
  resolvedViaSridRows: number;
  resolvedViaNmIdRows: number;
  unresolvedRows: number;
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
 * Map finance/sale SRID → product_id. Prefer non-return sales when both exist.
 */
export function buildSridToProductIdMap(sales: readonly WbSale[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const sale of sales) {
    if (!sale.srid || !sale.product_id) continue;
    const srid = String(sale.srid);
    const productId = String(sale.product_id);
    if (sale.is_return) {
      if (!map.has(srid)) map.set(srid, productId);
      continue;
    }
    map.set(srid, productId);
  }
  return map;
}

/**
 * nm_id → product_id only when exactly one product in the account catalogue
 * carries that nm_id. Ambiguous nm_ids are omitted (no attribution).
 */
export function buildUnambiguousNmIdToProductIdMap(
  products: readonly { id: string | number; nm_id: number | null | undefined }[]
): Map<number, string> {
  const buckets = new Map<number, Set<string>>();
  for (const product of products) {
    const nm = product.nm_id;
    if (nm == null || !Number.isFinite(Number(nm))) continue;
    const nmId = Number(nm);
    const set = buckets.get(nmId) ?? new Set<string>();
    set.add(String(product.id));
    buckets.set(nmId, set);
  }
  const map = new Map<number, string>();
  for (const [nmId, ids] of buckets) {
    if (ids.size === 1) map.set(nmId, [...ids][0]!);
  }
  return map;
}

export function resolveLogisticsProductId(
  row: Pick<WbFinance, "product_id" | "srid" | "nm_id">,
  sridToProductId: Map<string, string>,
  nmIdToProductId: Map<number, string>
): { productId: string | null; method: LogisticsResolveMethod } {
  if (row.product_id) {
    return { productId: String(row.product_id), method: "existing_product_id" };
  }
  if (row.srid) {
    const viaSrid = sridToProductId.get(String(row.srid));
    if (viaSrid) return { productId: viaSrid, method: "srid" };
  }
  if (row.nm_id != null && Number.isFinite(Number(row.nm_id))) {
    const viaNm = nmIdToProductId.get(Number(row.nm_id));
    if (viaNm) return { productId: viaNm, method: "nm_id" };
  }
  return { productId: null, method: "unresolved" };
}

/**
 * Stamp LOGISTICS rows that lack product_id using SRID then unambiguous nm_id.
 * Non-logistics rows are returned unchanged. Never invents percentage shares.
 */
export function stampLogisticsProductIds(
  finance: readonly WbFinance[],
  sales: readonly WbSale[],
  products: readonly { id: string | number; nm_id: number | null | undefined }[]
): {
  finance: WbFinance[];
  resolvedViaSridAbs: number;
  resolvedViaNmIdAbs: number;
  unresolvedAbs: number;
  resolvedViaSridRows: number;
  resolvedViaNmIdRows: number;
  unresolvedRows: number;
  accountLogisticsTotal: number;
} {
  const sridToProductId = buildSridToProductIdMap(sales);
  const nmIdToProductId = buildUnambiguousNmIdToProductIdMap(products);

  let resolvedViaSridAbs = 0;
  let resolvedViaNmIdAbs = 0;
  let unresolvedAbs = 0;
  let resolvedViaSridRows = 0;
  let resolvedViaNmIdRows = 0;
  let unresolvedRows = 0;
  let accountLogisticsTotal = 0;

  const out: WbFinance[] = [];

  for (const row of finance) {
    const isLogistics = rowMatchesFinanceCategory(row, "LOGISTICS");
    if (!isLogistics) {
      out.push(row);
      continue;
    }

    const abs = Math.abs(Number(row.amount) || 0);
    accountLogisticsTotal += abs;

    if (row.product_id) {
      out.push(row);
      continue;
    }

    const { productId, method } = resolveLogisticsProductId(
      row,
      sridToProductId,
      nmIdToProductId
    );

    if (method === "srid" && productId) {
      resolvedViaSridAbs += abs;
      resolvedViaSridRows += 1;
      out.push({ ...row, product_id: productId });
      continue;
    }
    if (method === "nm_id" && productId) {
      resolvedViaNmIdAbs += abs;
      resolvedViaNmIdRows += 1;
      out.push({ ...row, product_id: productId });
      continue;
    }

    unresolvedAbs += abs;
    unresolvedRows += 1;
    out.push(row);
  }

  return {
    finance: out,
    resolvedViaSridAbs,
    resolvedViaNmIdAbs,
    unresolvedAbs,
    resolvedViaSridRows,
    resolvedViaNmIdRows,
    unresolvedRows,
    accountLogisticsTotal,
  };
}

/**
 * Product profitability: outbound logistics only when SRID matches a completed purchase.
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
    if (!rowMatchesFinanceCategory(row, "LOGISTICS")) {
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

/** Unit logistics = Product Total Logistics (eligible) ÷ Net Units. */
export function calculateUnitLogisticsCost(
  productTotalLogistics: number,
  netUnits: number
): number | null {
  if (!Number.isFinite(netUnits) || netUnits <= 0) return null;
  if (!Number.isFinite(productTotalLogistics)) return null;
  return productTotalLogistics / netUnits;
}

export function calculateNetUnits(unitsSold: number, unitsReturned: number): number {
  return (Number(unitsSold) || 0) - (Number(unitsReturned) || 0);
}

export function buildProductLogisticsReconciliation(input: {
  accountLogisticsTotal: number;
  attributedProductLogistics: number;
  resolvedViaSridAbs: number;
  resolvedViaNmIdAbs: number;
  unresolvedAbs: number;
  resolvedViaSridRows: number;
  resolvedViaNmIdRows: number;
  unresolvedRows: number;
}): ProductLogisticsReconciliation {
  const attributed = input.attributedProductLogistics;
  const unallocated = input.accountLogisticsTotal - attributed;
  return {
    accountLogisticsTotal: input.accountLogisticsTotal,
    attributedProductLogistics: attributed,
    unallocatedLogistics: unallocated,
    resolvedViaSridAbs: input.resolvedViaSridAbs,
    resolvedViaNmIdAbs: input.resolvedViaNmIdAbs,
    unresolvedAbs: input.unresolvedAbs,
    resolvedViaSridRows: input.resolvedViaSridRows,
    resolvedViaNmIdRows: input.resolvedViaNmIdRows,
    unresolvedRows: input.unresolvedRows,
  };
}
