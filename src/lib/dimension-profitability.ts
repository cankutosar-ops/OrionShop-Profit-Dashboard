import { calculateModelBMarginPercent } from "@/lib/profit-engine-model-b";
import type { GroupedProfitability, ModelBProfitMetrics, ProductProfitability } from "@/types/database";

/**
 * Configurable grouping dimension for profitability rollups.
 * Financial math always comes from Model B product rows — only the key changes.
 */
export type ProfitabilityDimension = "category" | "brand";

/** Future-ready dimension keys (not yet wired in UI). */
export type ProfitabilityDimensionFuture =
  | ProfitabilityDimension
  | "collection"
  | "supplier"
  | "marketplace"
  | "country";

const UNALLOCATED_ID = "__unallocated__";
const UNALLOCATED_NAME = "Unallocated";

type ProductDimensionSource = Pick<
  ProductProfitability,
  | "categoryName"
  | "brandName"
  | "revenue"
  | "finalNetProfit"
  | "netSales"
  | "unitsSold"
  | "unitsReturned"
>;

function dimensionKey(
  product: ProductDimensionSource,
  dimension: ProfitabilityDimension
): { id: string; name: string } {
  switch (dimension) {
    case "brand": {
      const name = product.brandName?.trim() || "Unknown";
      return { id: `brand:${name}`, name };
    }
    case "category":
    default: {
      const name = product.categoryName?.trim() || "Uncategorized";
      return { id: `category:${name}`, name };
    }
  }
}

/**
 * Roll product-level Model B outputs into a dimension (Category / Brand / …).
 * Does not recompute profit — only groups `revenue` (Model B forPay) and `finalNetProfit`.
 */
export function buildDimensionProfitability(
  products: ProductDimensionSource[],
  dimension: ProfitabilityDimension
): GroupedProfitability[] {
  const map = new Map<
    string,
    GroupedProfitability & { _totalUnits: number; _returnedUnits: number }
  >();

  for (const product of products) {
    const { id, name } = dimensionKey(product, dimension);
    const existing = map.get(id) ?? {
      id,
      name,
      revenue: 0,
      finalNetProfit: 0,
      productCount: 0,
      returnRate: 0,
      _totalUnits: 0,
      _returnedUnits: 0,
    };

    existing.revenue += product.revenue;
    existing.finalNetProfit += product.finalNetProfit;
    existing.productCount += 1;
    existing._totalUnits += product.unitsSold + product.unitsReturned;
    existing._returnedUnits += product.unitsReturned;

    map.set(id, existing);
  }

  return Array.from(map.values())
    .map(({ _totalUnits, _returnedUnits, ...row }) => ({
      ...row,
      returnRate: _totalUnits > 0 ? (_returnedUnits / _totalUnits) * 100 : 0,
    }))
    .sort((a, b) => b.finalNetProfit - a.finalNetProfit);
}

/**
 * Plug account-level / unattributed Model B remainder so
 * Σ(group) revenue & finalNetProfit match Dashboard Model B exactly.
 * Remainder = Dashboard Model B − Σ(product Model B) — not a separate formula.
 */
export function alignGroupedProfitabilityToModelB(
  rows: GroupedProfitability[],
  modelB: Pick<ModelBProfitMetrics, "revenue" | "finalNetProfit">
): GroupedProfitability[] {
  const attributedRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const attributedProfit = rows.reduce((sum, row) => sum + row.finalNetProfit, 0);
  const residualRevenue = modelB.revenue - attributedRevenue;
  const residualProfit = modelB.finalNetProfit - attributedProfit;

  if (Math.abs(residualRevenue) < 0.005 && Math.abs(residualProfit) < 0.005) {
    return rows;
  }

  const withoutPrior = rows.filter((row) => row.id !== UNALLOCATED_ID);
  return [
    ...withoutPrior,
    {
      id: UNALLOCATED_ID,
      name: UNALLOCATED_NAME,
      revenue: residualRevenue,
      finalNetProfit: residualProfit,
      productCount: 0,
      returnRate: 0,
    },
  ].sort((a, b) => b.finalNetProfit - a.finalNetProfit);
}

export function sumGroupedProfitability(rows: GroupedProfitability[]): {
  revenue: number;
  finalNetProfit: number;
  productCount: number;
} {
  return rows.reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      finalNetProfit: acc.finalNetProfit + row.finalNetProfit,
      productCount: acc.productCount + row.productCount,
    }),
    { revenue: 0, finalNetProfit: 0, productCount: 0 }
  );
}

/** Net Margin % = Final Net Profit ÷ Model B Revenue (forPay). */
export function groupedNetMarginPercent(
  row: Pick<GroupedProfitability, "revenue" | "finalNetProfit">
): number {
  return calculateModelBMarginPercent(row.revenue, row.finalNetProfit);
}

/** @deprecated Use buildDimensionProfitability(products, "category"). */
export function buildCategoryProfitabilityFromProducts(
  products: ProductDimensionSource[]
): GroupedProfitability[] {
  return buildDimensionProfitability(products, "category");
}
