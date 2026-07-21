import { buildDimensionProfitability } from "@/lib/dimension-profitability";
import { calculateModelBMarginPercent } from "@/lib/profit-engine-model-b";
import { buildPriorPeriodScope } from "@/lib/reports/business-report-insights";
import { buildProductExecutiveInsights } from "@/lib/reports/product-report-insights";
import { provideBusinessInventorySummary } from "@/lib/reports/report-providers";
import type {
  ProductReportAppendixData,
  ProductReportCostRow,
  ProductReportExecutiveData,
  ProductReportInventoryData,
  ProductReportMarketplaceCostData,
  ProductReportPerformanceData,
  ProductReportPerformanceRow,
  ProductReportPortfolioData,
  ProductReportPortfolioGroup,
  ProductReportProfitabilityData,
  ProductReportRankRow,
  ReportSection,
} from "@/lib/reports/report-engine-types";
import {
  getDashboardListData,
  getProductProfitability,
} from "@/services/dashboard-service";
import { getInventoryIntelligence } from "@/services/inventory-intelligence-service";
import { getInventoryReport } from "@/services/inventory-report-service";
import { getProductAnalytics } from "@/services/product-analytics-service";
import type { ProductProfitability, ScopedDateRange } from "@/types/database";

const TOP_N = 20;

/**
 * Product Report providers — thin adapters over existing dashboard / module services.
 * No business math ownership: select, sort, join, and shape only.
 */

function marginOf(product: ProductProfitability): number {
  return calculateModelBMarginPercent(product.revenue, product.finalNetProfit);
}

function otherMarketplaceCosts(product: ProductProfitability): number {
  return product.penalties + product.otherExpenses;
}

function totalMarketplaceCost(product: ProductProfitability): number {
  return (
    product.commission +
    product.logistics +
    product.returnLogistics +
    product.storage +
    product.advertising +
    otherMarketplaceCosts(product)
  );
}

function toRankRow(
  product: ProductProfitability,
  rank: number,
  value: number
): ProductReportRankRow {
  return {
    rank,
    sku: product.modelCode,
    productName: product.productName,
    brandName: product.brandName,
    categoryName: product.categoryName,
    value,
  };
}

function rankBy(
  products: ProductProfitability[],
  score: (p: ProductProfitability) => number,
  limit: number,
  ascending = false
): ProductReportRankRow[] {
  const sorted = [...products].sort((a, b) =>
    ascending ? score(a) - score(b) : score(b) - score(a)
  );
  return sorted
    .slice(0, limit)
    .map((product, index) => toRankRow(product, index + 1, score(product)));
}

function buildPerformanceRows(
  products: ProductProfitability[],
  stockByProductId: Map<string, number>,
  statusByProductId: Map<string, string>
): ProductReportPerformanceRow[] {
  return [...products]
    .sort((a, b) => b.revenue - a.revenue)
    .map((product) => ({
      productId: product.productId,
      sku: product.modelCode,
      productName: product.productName,
      brandName: product.brandName,
      categoryName: product.categoryName,
      revenue: product.revenue,
      profit: product.finalNetProfit,
      marginPercent: marginOf(product),
      orders: product.orders,
      purchases: product.purchases,
      conversionPercent: product.conversionPercent,
      unitsSold: product.unitsSold,
      inventory: stockByProductId.get(product.productId) ?? 0,
      marketplaceFees: product.marketplaceFees,
      advertising: product.advertising,
      status:
        statusByProductId.get(product.productId) ??
        statusByProductId.get(product.modelCode) ??
        "—",
    }));
}

function buildCostRows(products: ProductProfitability[]): ProductReportCostRow[] {
  return [...products]
    .sort((a, b) => totalMarketplaceCost(b) - totalMarketplaceCost(a))
    .map((product) => ({
      sku: product.modelCode,
      productName: product.productName,
      commission: product.commission,
      logistics: product.logistics,
      returnLogistics: product.returnLogistics,
      storage: product.storage,
      advertising: product.advertising,
      otherMarketplaceCosts: otherMarketplaceCosts(product),
      totalMarketplaceCost: totalMarketplaceCost(product),
    }));
}

function toPortfolioGroups(
  groups: ReturnType<typeof buildDimensionProfitability>,
  totalRevenue: number,
  totalProfit: number
): ProductReportPortfolioGroup[] {
  return groups
    .map((group) => ({
      name: group.name,
      productCount: group.productCount,
      revenue: group.revenue,
      profit: group.finalNetProfit,
      revenueSharePercent:
        totalRevenue > 0 ? (group.revenue / totalRevenue) * 100 : 0,
      profitSharePercent:
        totalProfit !== 0
          ? (group.finalNetProfit / Math.abs(totalProfit)) * 100
          : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function buildStatusGroups(
  rows: ProductReportPerformanceRow[],
  totalRevenue: number,
  totalProfit: number
): ProductReportPortfolioGroup[] {
  const map = new Map<
    string,
    { productCount: number; revenue: number; profit: number }
  >();

  for (const row of rows) {
    const key = row.status || "—";
    const existing = map.get(key) ?? { productCount: 0, revenue: 0, profit: 0 };
    existing.productCount += 1;
    existing.revenue += row.revenue;
    existing.profit += row.profit;
    map.set(key, existing);
  }

  return [...map.entries()]
    .map(([name, value]) => ({
      name,
      productCount: value.productCount,
      revenue: value.revenue,
      profit: value.profit,
      revenueSharePercent:
        totalRevenue > 0 ? (value.revenue / totalRevenue) * 100 : 0,
      profitSharePercent:
        totalProfit !== 0 ? (value.profit / Math.abs(totalProfit)) * 100 : 0,
    }))
    .sort((a, b) => b.productCount - a.productCount);
}

export async function provideProductReportSections(
  scope: ScopedDateRange
): Promise<ReportSection[]> {
  const priorScope = buildPriorPeriodScope(scope);

  const [
    products,
    listData,
    analytics,
    inventorySection,
    intelligence,
    inventoryReport,
    priorProducts,
  ] = await Promise.all([
    getProductProfitability(scope),
    getDashboardListData(scope),
    getProductAnalytics(scope).catch(() => null),
    provideBusinessInventorySummary(scope),
    getInventoryIntelligence(scope).catch(() => null),
    getInventoryReport(scope).catch(() => null),
    getProductProfitability(priorScope).catch(() => [] as ProductProfitability[]),
  ]);

  const inventoryData = inventorySection.data;
  const stockByProductId = new Map<string, number>();
  const statusByProductId = new Map<string, string>();

  if (analytics?.v3All) {
    for (const row of analytics.v3All) {
      stockByProductId.set(row.productId, row.currentStock);
    }
  }

  if (inventoryReport) {
    for (const model of inventoryReport.models) {
      stockByProductId.set(model.productId, model.currentStock);
      statusByProductId.set(model.productId, model.status);
      statusByProductId.set(model.supplierArticle, model.status);
    }
  }

  const performanceRows = buildPerformanceRows(
    products,
    stockByProductId,
    statusByProductId
  );
  const costRows = buildCostRows(products);
  const totals = costRows.reduce(
    (acc, row) => {
      acc.commission += row.commission;
      acc.logistics += row.logistics;
      acc.returnLogistics += row.returnLogistics;
      acc.storage += row.storage;
      acc.advertising += row.advertising;
      acc.otherMarketplaceCosts += row.otherMarketplaceCosts;
      acc.totalMarketplaceCost += row.totalMarketplaceCost;
      return acc;
    },
    {
      commission: 0,
      logistics: 0,
      returnLogistics: 0,
      storage: 0,
      advertising: 0,
      otherMarketplaceCosts: 0,
      totalMarketplaceCost: 0,
    }
  );

  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  const totalProfit = products.reduce((sum, p) => sum + p.finalNetProfit, 0);

  const byBrand = toPortfolioGroups(
    buildDimensionProfitability(products, "brand"),
    totalRevenue,
    totalProfit
  );
  const byCategory = toPortfolioGroups(
    buildDimensionProfitability(products, "category"),
    totalRevenue,
    totalProfit
  );
  const byStatus = buildStatusGroups(performanceRows, totalRevenue, totalProfit);

  const portfolio: ProductReportPortfolioData = {
    byBrand,
    byCategory,
    byStatus,
    largestBrand: byBrand[0] ?? null,
    largestCategory:
      [...byCategory].sort((a, b) => b.productCount - a.productCount)[0] ?? null,
    highestRevenueCategory: byCategory[0] ?? null,
    highestProfitCategory:
      [...byCategory].sort((a, b) => b.profit - a.profit)[0] ?? null,
  };

  const profitability: ProductReportProfitabilityData = {
    topProfit: rankBy(products, (p) => p.finalNetProfit, TOP_N),
    bottomProfit: rankBy(products, (p) => p.finalNetProfit, TOP_N, true),
    highestMargin: rankBy(
      products.filter((p) => p.revenue > 0),
      marginOf,
      TOP_N
    ),
    lowestMargin: rankBy(
      products.filter((p) => p.revenue > 0),
      marginOf,
      TOP_N,
      true
    ),
    negativeProfit: products
      .filter((p) => p.finalNetProfit < 0)
      .sort((a, b) => a.finalNetProfit - b.finalNetProfit)
      .map((product, index) =>
        toRankRow(product, index + 1, product.finalNetProfit)
      ),
  };

  const productsWithSales = products.filter(
    (p) => p.purchases > 0 || p.revenue > 0 || p.unitsSold > 0
  ).length;
  const activeProducts = performanceRows.filter(
    (row) => row.inventory > 0 || row.purchases > 0 || row.revenue > 0
  ).length;

  const unitsSoldTotal = products.reduce((sum, p) => sum + p.unitsSold, 0);
  const revenueTotal = products.reduce((sum, p) => sum + p.revenue, 0);
  const margins = products.filter((p) => p.revenue > 0).map(marginOf);
  const averageMarginPercent =
    margins.length > 0
      ? margins.reduce((sum, m) => sum + m, 0) / margins.length
      : analytics?.totals.marginPercent ?? null;

  const inventoryUnits =
    inventoryReport?.models.reduce((sum, m) => sum + m.currentStock, 0) ??
    (stockByProductId.size > 0
      ? [...stockByProductId.values()].reduce((sum, n) => sum + n, 0)
      : null);

  const atRisk =
    intelligence?.rows != null
      ? intelligence.rows.filter((r) => r.stockHealth === "At Risk").length
      : null;

  const executiveBase: Omit<ProductReportExecutiveData, "insights"> = {
    totalProducts: Math.max(
      products.length,
      listData.products.length,
      inventoryReport?.models.length ?? 0
    ),
    activeProducts,
    productsWithSales,
    topRevenueProduct: rankBy(products, (p) => p.revenue, 1)[0] ?? null,
    topProfitProduct: rankBy(products, (p) => p.finalNetProfit, 1)[0] ?? null,
    highestMarginProduct:
      rankBy(
        products.filter((p) => p.revenue > 0),
        marginOf,
        1
      )[0] ?? null,
    highestConversionProduct:
      rankBy(
        products.filter((p) => p.orders > 0),
        (p) => p.conversionPercent,
        1
      )[0] ?? null,
    highestReturnProduct: rankBy(products, (p) => p.returnRate, 1)[0] ?? null,
    lowestPerformingProduct:
      rankBy(products, (p) => p.finalNetProfit, 1, true)[0] ?? null,
    averageMarginPercent,
    averageSellingPrice:
      unitsSoldTotal > 0 ? revenueTotal / unitsSoldTotal : null,
    inventoryUnits,
    inventoryValue: null,
  };

  const priorNegative = priorProducts.filter((p) => p.finalNetProfit < 0).length;
  const priorWithSales = priorProducts.filter(
    (p) => p.purchases > 0 || p.revenue > 0 || p.unitsSold > 0
  ).length;
  const priorRevenue = priorProducts.reduce((sum, p) => sum + p.revenue, 0);

  const insights = buildProductExecutiveInsights({
    executive: executiveBase,
    profitability,
    portfolio,
    performanceRows,
    prior:
      priorProducts.length > 0
        ? {
            productsWithSales: priorWithSales,
            negativeProfitCount: priorNegative,
            totalRevenue: priorRevenue,
          }
        : null,
    currency: "RUB",
  });

  const inventoryNotes = [...inventoryData.notes];
  inventoryNotes.push(
    "Critical Stock is not a separate Inventory status in dashboard services. At Risk counts come from Inventory Intelligence when available."
  );
  inventoryNotes.push(
    "Monetary Inventory Value is not provided by current dashboard services and is shown as unavailable."
  );

  return [
    {
      id: "product-executive-summary",
      titleKey: "report.product.executiveSummary",
      data: { ...executiveBase, insights } satisfies ProductReportExecutiveData,
    },
    {
      id: "product-performance",
      titleKey: "report.product.performance",
      data: { rows: performanceRows } satisfies ProductReportPerformanceData,
    },
    {
      id: "product-profitability",
      titleKey: "report.product.profitability",
      data: profitability,
    },
    {
      id: "product-marketplace-cost",
      titleKey: "report.product.marketplaceCost",
      data: { rows: costRows, totals } satisfies ProductReportMarketplaceCostData,
    },
    {
      id: "product-inventory",
      titleKey: "report.product.inventory",
      data: {
        health: {
          healthy: inventoryData.health.healthy,
          lowStock: inventoryData.health.lowStock,
          outOfStock: inventoryData.health.outOfStock,
          atRisk,
        },
        stockRows: inventoryData.stockRows,
        warehouseDistribution: inventoryData.warehouseDistribution,
        notes: inventoryNotes,
      } satisfies ProductReportInventoryData,
    },
    {
      id: "product-portfolio",
      titleKey: "report.product.portfolio",
      data: portfolio,
    },
    {
      id: "product-appendix",
      titleKey: "report.product.appendix",
      data: { rows: performanceRows, costRows } satisfies ProductReportAppendixData,
    },
  ];
}

export function isProductReportEmpty(sections: ReportSection[]): boolean {
  const performance = sections.find((s) => s.id === "product-performance");
  const rows =
    (performance?.data as ProductReportPerformanceData | undefined)?.rows ?? [];
  if (rows.length === 0) return true;
  return rows.every(
    (row) =>
      row.revenue === 0 &&
      row.profit === 0 &&
      row.orders === 0 &&
      row.purchases === 0
  );
}
