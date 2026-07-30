import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";

export type ProfitabilityRow = {
  id: string;
  name: string;
  revenue: number;
  finalNetProfit: number;
  productCount?: number;
  returnRate?: number;
};

export type ProfitabilityData = {
  brands: ProfitabilityRow[];
  categories: ProfitabilityRow[];
  /** Top products by final net profit (already computed by dashboard services). */
  topProducts: Array<{
    productId: string;
    modelCode: string;
    productName: string;
    brandName: string;
    categoryName: string;
    revenue: number;
    finalNetProfit: number;
    netSales: number;
  }>;
};

const TOP_N = 25;

export function buildProfitabilitySection(
  ctx: ReportContext
): ReportSection<ProfitabilityData> {
  const topProducts = [...ctx.products]
    .sort((a, b) => b.finalNetProfit - a.finalNetProfit)
    .slice(0, TOP_N)
    .map((p) => ({
      productId: p.productId,
      modelCode: p.modelCode,
      productName: p.productName,
      brandName: p.brandName,
      categoryName: p.categoryName,
      revenue: p.revenue,
      finalNetProfit: p.finalNetProfit,
      netSales: p.netSales,
    }));

  return {
    id: "profitability",
    kind: "profitability",
    title: "Profitability",
    description: "Brand, category, and product profitability from dashboard analytics",
    data: {
      brands: ctx.brands.map((b) => ({
        id: b.id,
        name: b.name,
        revenue: b.revenue,
        finalNetProfit: b.finalNetProfit,
        productCount: b.productCount,
        returnRate: b.returnRate,
      })),
      categories: ctx.categories.map((c) => ({
        id: c.id,
        name: c.name,
        revenue: c.revenue,
        finalNetProfit: c.finalNetProfit,
        productCount: c.productCount,
        returnRate: c.returnRate,
      })),
      topProducts,
    },
  };
}
