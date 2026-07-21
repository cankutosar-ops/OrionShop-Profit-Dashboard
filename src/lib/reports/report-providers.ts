import {
  getDashboardListData,
  getOverviewMetrics,
  getProductProfitability,
} from "@/services/dashboard-service";
import { getInventoryReport } from "@/services/inventory-report-service";
import { getWarehouseSalesAnalytics } from "@/services/warehouse-sales-analytics-service";
import {
  buildExecutiveInsights,
  buildPriorPeriodScope,
} from "@/lib/reports/business-report-insights";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type { ProductProfitability, ScopedDateRange } from "@/types/database";
import type {
  BusinessExecutiveSummaryData,
  BusinessFinancialSummaryData,
  BusinessInventorySummaryData,
  BusinessProductHighlight,
  BusinessProductRankRow,
  BusinessProductSummaryData,
  BusinessReportKpiData,
  ReportSection,
} from "@/lib/reports/report-engine-types";

const TOP_N = 10;
const STOCK_ROWS = 25;

/**
 * Thin adapters to existing dashboard / module services.
 * Providers must not calculate business math — only select, sort, and shape.
 */

function topBy(
  products: ProductProfitability[],
  score: (p: ProductProfitability) => number,
  limit: number
): BusinessProductRankRow[] {
  return [...products]
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((product, index) => ({
      rank: index + 1,
      sku: product.modelCode,
      productName: product.productName,
      value: score(product),
    }));
}

type OverviewMetrics = Awaited<ReturnType<typeof getOverviewMetrics>>;

function mapExecutiveBase(overview: OverviewMetrics): Omit<
  BusinessExecutiveSummaryData,
  "insights"
> {
  const purchases = overview.ordersPurchases.purchasesCount;
  const purchasesAmount = overview.ordersPurchases.purchasesAmount;

  return {
    revenue: overview.revenue,
    netProfit: overview.netProfit,
    orders: overview.ordersPurchases.ordersCount,
    purchases,
    conversionRate: overview.ordersPurchases.conversionRate,
    returnRate: overview.ordersPurchases.returnRate,
    marketplaceCosts: overview.marketplaceFeesPresentation.marketplaceFees,
    unitsSold: overview.unitsSold,
    unitsReturned: overview.unitsReturned,
    averageSellingPrice:
      purchases > 0 ? purchasesAmount / purchases : null,
  };
}

function mapFinancialSummary(
  overview: OverviewMetrics
): BusinessFinancialSummaryData {
  const settlement = overview.wbSettlement;
  const available = settlement.availability?.available !== false;

  return {
    revenue: overview.revenue,
    productCost: overview.productCost,
    marketplaceFees: overview.marketplaceFeesPresentation.marketplaceFees,
    commission: overview.commission,
    logistics: overview.logistics,
    returnLogistics: overview.returnLogistics,
    storage: overview.storage,
    advertising: overview.advertising,
    penalties: overview.penalties,
    otherExpenses: overview.otherExpenses,
    netProfit: overview.netProfit,
    wbSettlement: {
      available,
      netForPay: settlement.netForPay,
      logistics: settlement.logistics,
      storage: settlement.storage,
      penalties: settlement.penalties,
      deductions: settlement.deductions,
      acceptance: settlement.acceptance,
      settlement: settlement.settlement,
      dataSource: settlement.dataSource,
    },
  };
}

function buildProductHighlights(
  data: Omit<BusinessProductSummaryData, "highlights">,
  currency: string
): BusinessProductHighlight[] {
  const highlights: BusinessProductHighlight[] = [];
  const push = (
    label: string,
    row: BusinessProductRankRow | undefined,
    format: (v: number) => string
  ) => {
    if (!row) return;
    highlights.push({
      label,
      sku: row.sku,
      productName: row.productName,
      valueLabel: format(row.value),
    });
  };

  push("Top Revenue Product", data.topRevenue[0], (v) => formatCurrency(v, currency));
  push("Top Profit Product", data.topProfit[0], (v) => formatCurrency(v, currency));
  push("Highest Conversion", data.bestConversion[0], (v) => formatPercent(v));
  push("Most Returned", data.mostReturned[0], (v) => formatNumber(v));
  push("Most Sold", data.mostSold[0], (v) => formatNumber(v));

  if (data.bestSellingBrand) {
    highlights.push({
      label: "Best Selling Brand",
      sku: data.bestSellingBrand.name,
      productName: "Brand revenue leader",
      valueLabel: formatCurrency(data.bestSellingBrand.revenue, currency),
    });
  }

  return highlights;
}

export async function provideBusinessProductSummary(
  scope: ScopedDateRange,
  currency = "RUB"
): Promise<ReportSection<BusinessProductSummaryData>> {
  const [products, listData] = await Promise.all([
    getProductProfitability(scope),
    getDashboardListData(scope),
  ]);

  const topBrand = [...listData.brands].sort((a, b) => b.revenue - a.revenue)[0];

  const base: Omit<BusinessProductSummaryData, "highlights"> = {
    topRevenue: topBy(products, (p) => p.revenue, TOP_N),
    topProfit: topBy(products, (p) => p.finalNetProfit, TOP_N),
    bestConversion: topBy(
      products.filter((p) => p.orders > 0),
      (p) => p.conversionPercent,
      TOP_N
    ),
    mostReturned: topBy(products, (p) => p.unitsReturned, TOP_N),
    mostSold: topBy(products, (p) => p.purchases, TOP_N),
    bestSellingBrand: topBrand
      ? { name: topBrand.name, revenue: topBrand.revenue }
      : null,
  };

  return {
    id: "product-summary",
    titleKey: "report.business.productSummary",
    data: {
      ...base,
      highlights: buildProductHighlights(base, currency),
    },
  };
}

export async function provideBusinessInventorySummary(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessInventorySummaryData>> {
  const [inventory, warehouseSales] = await Promise.all([
    getInventoryReport(scope),
    getWarehouseSalesAnalytics(scope),
  ]);

  const notes: string[] = [];
  if (!inventory) {
    notes.push("Inventory stock overview unavailable for this scope.");
  }
  notes.push(
    "Incoming shipments are not included — no account-level shipment aggregate exists in dashboard services yet."
  );

  const models = inventory?.models ?? [];
  const health = {
    healthy: models.filter((m) => m.status === "Healthy").length,
    lowStock: models.filter((m) => m.status === "Low Stock").length,
    outOfStock: models.filter((m) => m.status === "Out of Stock").length,
    warehouseCoverage: warehouseSales?.rows.length ?? 0,
  };

  const stockRows = models.slice(0, STOCK_ROWS).map((model) => ({
    sku: model.supplierArticle,
    productName: model.productName,
    currentStock: model.currentStock,
    daysLeft: model.daysLeft,
    status: model.status,
  }));

  const warehouseDistribution =
    warehouseSales?.rows.slice(0, 20).map((row) => ({
      warehouse: row.warehouse,
      orders: row.orders,
      units: row.units,
      revenue: row.revenue,
      orderSharePercent: row.orderSharePercent,
      revenueSharePercent: row.revenueSharePercent,
    })) ?? [];

  if (!warehouseSales || warehouseDistribution.length === 0) {
    notes.push("Warehouse sales distribution unavailable for this period.");
  }

  return {
    id: "inventory-summary",
    titleKey: "report.business.inventorySummary",
    data: {
      health,
      stockRows,
      warehouseDistribution,
      notes,
    },
  };
}

/** Assemble all Business Report sections (parallel where independent). */
export async function provideBusinessReportSections(
  scope: ScopedDateRange
): Promise<ReportSection[]> {
  const priorScope = buildPriorPeriodScope(scope);

  const [overview, priorOverview, product, inventory] = await Promise.all([
    getOverviewMetrics(scope),
    getOverviewMetrics(priorScope).catch(() => null),
    provideBusinessProductSummary(scope),
    provideBusinessInventorySummary(scope),
  ]);

  // Re-run product highlights with company currency once known from overview path —
  // currency comes from identity later; RUB default matches dashboard formatters.
  const executiveBase = mapExecutiveBase(overview);
  const productData = product.data;
  const insights = buildExecutiveInsights({
    current: { ...executiveBase, insights: [] },
    prior: priorOverview
      ? {
          revenue: priorOverview.revenue,
          netProfit: priorOverview.netProfit,
          conversionRate: priorOverview.ordersPurchases.conversionRate,
          returnRate: priorOverview.ordersPurchases.returnRate,
        }
      : null,
    product: productData,
    currency: "RUB",
  });

  const executive: ReportSection<BusinessExecutiveSummaryData> = {
    id: "executive-summary",
    titleKey: "report.business.executiveSummary",
    data: { ...executiveBase, insights },
  };
  const financial: ReportSection<BusinessFinancialSummaryData> = {
    id: "financial-summary",
    titleKey: "report.business.financialSummary",
    data: mapFinancialSummary(overview),
  };

  return [executive, financial, product, inventory];
}

export async function provideBusinessExecutiveSummary(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessExecutiveSummaryData>> {
  const sections = await provideBusinessReportSections(scope);
  const executive = sections.find((s) => s.id === "executive-summary");
  if (!executive) {
    throw new Error("Executive summary section missing");
  }
  return executive as ReportSection<BusinessExecutiveSummaryData>;
}

export async function provideBusinessFinancialSummary(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessFinancialSummaryData>> {
  const overview = await getOverviewMetrics(scope);
  return {
    id: "financial-summary",
    titleKey: "report.business.financialSummary",
    data: mapFinancialSummary(overview),
  };
}

/** @deprecated Sprint 7.1 helper — prefer executive summary. */
export async function provideBusinessReportKpis(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessReportKpiData>> {
  const executive = await provideBusinessExecutiveSummary(scope);
  return {
    id: "business-kpis",
    titleKey: "report.business.kpis",
    data: {
      revenue: executive.data.revenue,
      profit: executive.data.netProfit,
      orders: executive.data.orders,
      purchases: executive.data.purchases,
    },
  };
}

/** No-data probe from trusted executive KPIs — no parallel emptiness formula. */
export function isBusinessReportEmpty(data: {
  revenue: number;
  netProfit?: number;
  profit?: number;
  orders: number;
  purchases: number;
}): boolean {
  const profit = data.netProfit ?? data.profit ?? 0;
  return (
    data.revenue === 0 && profit === 0 && data.orders === 0 && data.purchases === 0
  );
}
