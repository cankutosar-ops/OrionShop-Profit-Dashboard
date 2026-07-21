import { getOverviewMetrics, getProductProfitability } from "@/services/dashboard-service";
import { getInventoryReport } from "@/services/inventory-report-service";
import { getWarehouseSalesAnalytics } from "@/services/warehouse-sales-analytics-service";
import type { ProductProfitability, ScopedDateRange } from "@/types/database";
import type {
  BusinessExecutiveSummaryData,
  BusinessFinancialSummaryData,
  BusinessInventorySummaryData,
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

function mapExecutiveSummary(
  overview: OverviewMetrics
): BusinessExecutiveSummaryData {
  return {
    revenue: overview.revenue,
    netProfit: overview.netProfit,
    orders: overview.ordersPurchases.ordersCount,
    purchases: overview.ordersPurchases.purchasesCount,
    conversionRate: overview.ordersPurchases.conversionRate,
    returnRate: overview.ordersPurchases.returnRate,
    marketplaceCosts: overview.marketplaceFeesPresentation.marketplaceFees,
    unitsSold: overview.unitsSold,
    unitsReturned: overview.unitsReturned,
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

export async function provideBusinessExecutiveSummary(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessExecutiveSummaryData>> {
  const overview = await getOverviewMetrics(scope);
  return {
    id: "executive-summary",
    titleKey: "report.business.executiveSummary",
    data: mapExecutiveSummary(overview),
  };
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

export async function provideBusinessProductSummary(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessProductSummaryData>> {
  // Same profitability owner as Product Analytics — no report-owned formulas.
  const products = await getProductProfitability(scope);

  return {
    id: "product-summary",
    titleKey: "report.business.productSummary",
    data: {
      topRevenue: topBy(products, (p) => p.revenue, TOP_N),
      topProfit: topBy(products, (p) => p.finalNetProfit, TOP_N),
      bestConversion: topBy(
        products.filter((p) => p.orders > 0),
        (p) => p.conversionPercent,
        TOP_N
      ),
      mostReturned: topBy(products, (p) => p.unitsReturned, TOP_N),
      mostSold: topBy(products, (p) => p.purchases, TOP_N),
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

  const stockRows =
    inventory?.models.slice(0, STOCK_ROWS).map((model) => ({
      sku: model.supplierArticle,
      productName: model.productName,
      currentStock: model.currentStock,
      daysLeft: model.daysLeft,
      status: model.status,
    })) ?? [];

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
  const [overview, product, inventory] = await Promise.all([
    getOverviewMetrics(scope),
    provideBusinessProductSummary(scope),
    provideBusinessInventorySummary(scope),
  ]);

  const executive: ReportSection<BusinessExecutiveSummaryData> = {
    id: "executive-summary",
    titleKey: "report.business.executiveSummary",
    data: mapExecutiveSummary(overview),
  };
  const financial: ReportSection<BusinessFinancialSummaryData> = {
    id: "financial-summary",
    titleKey: "report.business.financialSummary",
    data: mapFinancialSummary(overview),
  };

  return [executive, financial, product, inventory];
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
