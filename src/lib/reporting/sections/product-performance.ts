/**
 * Product Intelligence — ranked boards + full portfolio projection.
 * Portfolio rows are FE product fields only — no new business formulas.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  contributionPercent,
  netMarginPercent,
  rankProductsBy,
  type RankedProduct,
} from "@/lib/reporting/section-utils";
import type { ProductProfitability } from "@/types/database";

const TOP_N = 15;

/** Full-scope product row for workspace / future Excel parity. */
export type ProductPortfolioRow = {
  productId: string;
  sku: string;
  productName: string;
  brandName: string;
  categoryName: string;
  revenue: number;
  netSales: number;
  orders: number;
  purchases: number;
  conversionPercent: number;
  unitsSold: number;
  unitsReturned: number;
  returnRate: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  productCost: number;
  operatingProfit: number;
  netProfit: number;
  marginPercent: number;
  contributionPercent: number;
};

export type ProductPerformanceData = {
  /** Complete portfolio for the selected Report Scope. */
  portfolio: ProductPortfolioRow[];
  portfolioTotals: {
    productCount: number;
    revenue: number;
    netProfit: number;
    orders: number;
  };
  topRevenue: RankedProduct[];
  topNetProfit: RankedProduct[];
  topMargin: RankedProduct[];
  lowestMargin: RankedProduct[];
  highestReturnRate: RankedProduct[];
  highestLogisticsCost: RankedProduct[];
  highestStorageCost: RankedProduct[];
  lowestPerforming: RankedProduct[];
  highestContribution: RankedProduct[];
  /** Backward-compatible aliases used by Business Report V1 consumers. */
  topByRevenue: RankedProduct[];
  topByNetProfit: RankedProduct[];
  topByMargin: RankedProduct[];
  worstByNetProfit: RankedProduct[];
};

function toPortfolioRow(
  product: ProductProfitability,
  totalProfit: number
): ProductPortfolioRow {
  const netProfit = product.finalNetProfit;
  return {
    productId: product.productId,
    sku: product.modelCode,
    productName: product.productName,
    brandName: product.brandName,
    categoryName: product.categoryName,
    revenue: product.revenue,
    netSales: product.netSales,
    orders: product.orders,
    purchases: product.purchases,
    conversionPercent: product.conversionPercent,
    unitsSold: product.unitsSold,
    unitsReturned: product.unitsReturned,
    returnRate: product.returnRate,
    marketplaceFees: product.marketplaceFees,
    logistics: product.logistics,
    storage: product.storage,
    productCost: product.productCost,
    operatingProfit: product.netProfit,
    netProfit,
    marginPercent: netMarginPercent(product.revenue, netProfit),
    contributionPercent: contributionPercent(netProfit, totalProfit),
  };
}

export function buildProductPerformanceSection(
  ctx: ReportContext
): ReportSection<ProductPerformanceData> {
  const products = ctx.products;
  const totalProfit = products.reduce((sum, p) => sum + p.finalNetProfit, 0);
  const portfolio = products
    .map((p) => toPortfolioRow(p, totalProfit))
    .sort((a, b) => b.netProfit - a.netProfit);

  const topRevenue = rankProductsBy(products, (p) => p.revenue, TOP_N);
  const topNetProfit = rankProductsBy(products, (p) => p.finalNetProfit, TOP_N);
  const topMargin = rankProductsBy(
    products.filter((p) => p.revenue > 0),
    (p) => netMarginPercent(p.revenue, p.finalNetProfit),
    TOP_N
  );
  const lowestMargin = rankProductsBy(
    products.filter((p) => p.revenue > 0),
    (p) => netMarginPercent(p.revenue, p.finalNetProfit),
    TOP_N,
    "asc"
  );
  const highestReturnRate = rankProductsBy(products, (p) => p.returnRate, TOP_N);
  const highestLogisticsCost = rankProductsBy(products, (p) => p.logistics, TOP_N);
  const highestStorageCost = rankProductsBy(products, (p) => p.storage, TOP_N);
  const lowestPerforming = rankProductsBy(
    products,
    (p) => p.finalNetProfit,
    TOP_N,
    "asc"
  );
  const highestContribution = rankProductsBy(
    products,
    (p) => contributionPercent(p.finalNetProfit, totalProfit),
    TOP_N
  );

  return {
    id: "product-performance",
    kind: "product-performance",
    title: "Product Intelligence",
    description:
      "Full product portfolio for the selected reporting period (Financial Engine product rows)",
    data: {
      portfolio,
      portfolioTotals: {
        productCount: portfolio.length,
        revenue: portfolio.reduce((sum, p) => sum + p.revenue, 0),
        netProfit: portfolio.reduce((sum, p) => sum + p.netProfit, 0),
        orders: portfolio.reduce((sum, p) => sum + p.orders, 0),
      },
      topRevenue,
      topNetProfit,
      topMargin,
      lowestMargin,
      highestReturnRate,
      highestLogisticsCost,
      highestStorageCost,
      lowestPerforming,
      highestContribution,
      topByRevenue: topRevenue,
      topByNetProfit: topNetProfit,
      topByMargin: topMargin,
      worstByNetProfit: lowestPerforming,
    },
  };
}
