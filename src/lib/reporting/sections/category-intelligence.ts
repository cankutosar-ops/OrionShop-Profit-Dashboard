/**
 * Category Intelligence — product-level FE rollups by categoryName.
 * Presentation aggregation only (same pattern as Brand Intelligence).
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  averagePerUnit,
  contributionPercent,
  netMarginPercent,
} from "@/lib/reporting/section-utils";
import type { ProductProfitability } from "@/types/database";

const BOARD_N = 8;

export type CategoryIntelligenceRow = {
  categoryName: string;
  revenue: number;
  netProfit: number;
  marginPercent: number;
  orders: number;
  purchases: number;
  unitsSold: number;
  unitsReturned: number;
  averageSellingPrice: number | null;
  averageProductCost: number | null;
  returnRate: number;
  contributionPercent: number;
  productCount: number;
};

export type CategoryRankItem = {
  rank: number;
  categoryName: string;
  value: number;
};

export type CategoryIntelligenceData = {
  categories: CategoryIntelligenceRow[];
  totals: {
    categoryCount: number;
    revenue: number;
    netProfit: number;
    orders: number;
  };
  boards: {
    topByRevenue: CategoryRankItem[];
    topByProfit: CategoryRankItem[];
    lowestMargin: CategoryRankItem[];
  };
};

type Acc = {
  categoryName: string;
  revenue: number;
  netProfit: number;
  orders: number;
  purchases: number;
  unitsSold: number;
  unitsReturned: number;
  productCost: number;
  productCount: number;
};

function emptyAcc(categoryName: string): Acc {
  return {
    categoryName,
    revenue: 0,
    netProfit: 0,
    orders: 0,
    purchases: 0,
    unitsSold: 0,
    unitsReturned: 0,
    productCost: 0,
    productCount: 0,
  };
}

function accumulate(acc: Acc, p: ProductProfitability): void {
  acc.revenue += p.revenue;
  acc.netProfit += p.finalNetProfit;
  acc.orders += p.orders;
  acc.purchases += p.purchases;
  acc.unitsSold += p.unitsSold;
  acc.unitsReturned += p.unitsReturned;
  acc.productCost += p.productCost;
  acc.productCount += 1;
}

function categoryReturnRate(unitsSold: number, unitsReturned: number): number {
  const base = unitsSold + unitsReturned;
  if (base <= 0) return 0;
  return (unitsReturned / base) * 100;
}

function rankCategories(
  rows: CategoryIntelligenceRow[],
  score: (r: CategoryIntelligenceRow) => number,
  direction: "desc" | "asc" = "desc"
): CategoryRankItem[] {
  const sorted = [...rows].sort((a, b) =>
    direction === "desc" ? score(b) - score(a) : score(a) - score(b)
  );
  return sorted.slice(0, BOARD_N).map((row, index) => ({
    rank: index + 1,
    categoryName: row.categoryName,
    value: score(row),
  }));
}

export function rollupCategoryIntelligence(
  products: ProductProfitability[]
): CategoryIntelligenceRow[] {
  const byCategory = new Map<string, Acc>();

  for (const product of products) {
    const name = product.categoryName?.trim() || "Uncategorized";
    const acc = byCategory.get(name) ?? emptyAcc(name);
    accumulate(acc, product);
    byCategory.set(name, acc);
  }

  const rows = [...byCategory.values()];
  const totalProfit = rows.reduce((sum, r) => sum + r.netProfit, 0);

  return rows
    .map((row) => ({
      categoryName: row.categoryName,
      revenue: row.revenue,
      netProfit: row.netProfit,
      marginPercent: netMarginPercent(row.revenue, row.netProfit),
      orders: row.orders,
      purchases: row.purchases,
      unitsSold: row.unitsSold,
      unitsReturned: row.unitsReturned,
      averageSellingPrice: averagePerUnit(row.revenue, row.unitsSold),
      averageProductCost: averagePerUnit(row.productCost, row.unitsSold),
      returnRate: categoryReturnRate(row.unitsSold, row.unitsReturned),
      contributionPercent: contributionPercent(row.netProfit, totalProfit),
      productCount: row.productCount,
    }))
    .sort((a, b) => b.netProfit - a.netProfit);
}

export function buildCategoryIntelligenceSection(
  ctx: ReportContext
): ReportSection<CategoryIntelligenceData> {
  const categories = rollupCategoryIntelligence(ctx.products);
  const withRevenue = categories.filter((c) => c.revenue > 0);

  return {
    id: "category-intelligence",
    kind: "category-intelligence",
    title: "Category Intelligence",
    description:
      "Category contribution from product-level Financial Engine outputs — where to invest",
    data: {
      categories,
      totals: {
        categoryCount: categories.length,
        revenue: categories.reduce((sum, c) => sum + c.revenue, 0),
        netProfit: categories.reduce((sum, c) => sum + c.netProfit, 0),
        orders: categories.reduce((sum, c) => sum + c.orders, 0),
      },
      boards: {
        topByRevenue: rankCategories(categories, (c) => c.revenue),
        topByProfit: rankCategories(categories, (c) => c.netProfit),
        lowestMargin: rankCategories(
          withRevenue,
          (c) => c.marginPercent,
          "asc"
        ),
      },
    },
  };
}
