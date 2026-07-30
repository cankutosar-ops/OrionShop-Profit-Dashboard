/**
 * Presentation helpers for report sections.
 * Ratios and ranking only — never recompute Financial Engine formulas.
 */
import { calculateNetMarginPercent } from "@/lib/profit-margin";
import { shareOfRevenueBasePercent } from "@/lib/sales-revenue-resolution";
import type { ProductProfitability } from "@/types/database";

export const FINANCIAL_ENGINE_VERSION = "V4";
export const CALCULATION_MODEL = "Commercial Performance (Model B) — Financial Engine V4";

export function netMarginPercent(revenue: number, finalNetProfit: number): number {
  return calculateNetMarginPercent(revenue, finalNetProfit);
}

export function percentOfRevenue(amount: number, revenue: number): number {
  return shareOfRevenueBasePercent(revenue, amount);
}

export function contributionPercent(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/** Per-unit average from trusted totals — null when units are zero. */
export function averagePerUnit(amount: number, units: number): number | null {
  if (units <= 0) return null;
  return amount / units;
}

export function emptyReportInsights(): import("@/lib/reporting/types").ReportInsights {
  return { highlights: [], warnings: [], opportunities: [] };
}

export type RankedProduct = {
  rank: number;
  productId: string;
  modelCode: string;
  productName: string;
  brandName: string;
  categoryName: string;
  value: number;
};

export type RankedBrand = {
  rank: number;
  brandName: string;
  value: number;
};

export function rankBrandsBy<T extends { brandName: string }>(
  brands: T[],
  score: (b: T) => number,
  limit: number,
  direction: "desc" | "asc" = "desc"
): RankedBrand[] {
  const sorted = [...brands].sort((a, b) =>
    direction === "desc" ? score(b) - score(a) : score(a) - score(b)
  );
  return sorted.slice(0, limit).map((brand, index) => ({
    rank: index + 1,
    brandName: brand.brandName,
    value: score(brand),
  }));
}

export function rankProductsBy(
  products: ProductProfitability[],
  score: (p: ProductProfitability) => number,
  limit: number,
  direction: "desc" | "asc" = "desc"
): RankedProduct[] {
  const sorted = [...products].sort((a, b) =>
    direction === "desc" ? score(b) - score(a) : score(a) - score(b)
  );
  return sorted.slice(0, limit).map((product, index) => ({
    rank: index + 1,
    productId: product.productId,
    modelCode: product.modelCode,
    productName: product.productName,
    brandName: product.brandName,
    categoryName: product.categoryName,
    value: score(product),
  }));
}

export function pickBestProduct(
  products: ProductProfitability[],
  score: (p: ProductProfitability) => number
): RankedProduct | null {
  return rankProductsBy(products, score, 1, "desc")[0] ?? null;
}

export function pickWorstProduct(
  products: ProductProfitability[],
  score: (p: ProductProfitability) => number
): RankedProduct | null {
  return rankProductsBy(products, score, 1, "asc")[0] ?? null;
}
