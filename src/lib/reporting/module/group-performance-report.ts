/**
 * Sprint 9.4 — Category / Brand Performance aggregation.
 * Presentation only — sums Product Profit report rows (Financial Engine outputs).
 * Never invents accounting formulas or calls Smart Pricing / marketplace APIs.
 */

import { calculateModelBMarginPercent } from "@/lib/financial-engine";
import type { ReportSummaryLine } from "@/components/reporting/report-summary-cards";
import type { ProductProfitability } from "@/types/database";
import {
  buildProductProfitReport,
  calculateProductRoiPercent,
  type ProductProfitReportRow,
  type ProductProfitSortKey,
} from "@/lib/reporting/module/product-profit-report";

export type GroupPerformanceDimension = "category" | "brand";

export type GroupPerformanceSortKey =
  | "netProfit"
  | "revenue"
  | "netMarginPercent"
  | "roiPercent"
  | "unitsSold";

export type GroupPerformanceRow = {
  groupKey: string;
  /** Category name or Brand name. */
  name: string;
  productCount: number;
  unitsSold: number;
  netSales: number;
  revenue: number;
  productCost: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  advertising: number;
  netProfit: number;
  netMarginPercent: number;
  roiPercent: number | null;
};

export type GroupPerformanceReportView = {
  source: "financialEngine.products.aggregated";
  dimension: GroupPerformanceDimension;
  currency: string;
  rows: GroupPerformanceRow[];
  summary: ReportSummaryLine[];
  totals: {
    groupCount: number;
    revenue: number;
    netProfit: number;
    unitsSold: number;
    averageMarginPercent: number;
  };
  /** Product rows that were aggregated (same filter set). */
  productRowCount: number;
};

type Acc = {
  name: string;
  productIds: Set<string>;
  unitsSold: number;
  netSales: number;
  revenue: number;
  productCost: number;
  marketplaceFees: number;
  logistics: number;
  storage: number;
  advertising: number;
  netProfit: number;
};

function emptyAcc(name: string): Acc {
  return {
    name,
    productIds: new Set(),
    unitsSold: 0,
    netSales: 0,
    revenue: 0,
    productCost: 0,
    marketplaceFees: 0,
    logistics: 0,
    storage: 0,
    advertising: 0,
    netProfit: 0,
  };
}

function groupKeyFromProduct(
  row: ProductProfitReportRow,
  dimension: GroupPerformanceDimension
): string {
  const raw = dimension === "category" ? row.category : row.brand;
  const name = raw?.trim() || "—";
  return name;
}

/**
 * Aggregate Product Profit rows by category or brand.
 * Totals are exact sums of the input product rows.
 */
export function aggregateProductProfitRows(
  productRows: ProductProfitReportRow[],
  dimension: GroupPerformanceDimension
): GroupPerformanceRow[] {
  const map = new Map<string, Acc>();

  for (const row of productRows) {
    const key = groupKeyFromProduct(row, dimension);
    let acc = map.get(key);
    if (!acc) {
      acc = emptyAcc(key);
      map.set(key, acc);
    }
    acc.productIds.add(row.productId);
    acc.unitsSold += row.unitsSold;
    acc.netSales += row.netSales;
    acc.revenue += row.revenue;
    acc.productCost += row.productCost;
    acc.marketplaceFees += row.marketplaceFees;
    acc.logistics += row.logistics;
    acc.storage += row.storage;
    acc.advertising += row.advertising;
    acc.netProfit += row.netProfit;
  }

  return [...map.entries()].map(([groupKey, acc]) => {
    const netMarginPercent = calculateModelBMarginPercent(acc.revenue, acc.netProfit);
    return {
      groupKey,
      name: acc.name,
      productCount: acc.productIds.size,
      unitsSold: acc.unitsSold,
      netSales: acc.netSales,
      revenue: acc.revenue,
      productCost: acc.productCost,
      marketplaceFees: acc.marketplaceFees,
      logistics: acc.logistics,
      storage: acc.storage,
      advertising: acc.advertising,
      netProfit: acc.netProfit,
      netMarginPercent,
      roiPercent: calculateProductRoiPercent(acc.netProfit, acc.productCost),
    };
  });
}

function sortGroupRows(
  rows: GroupPerformanceRow[],
  sortKey: GroupPerformanceSortKey = "netProfit",
  direction: "asc" | "desc" = "desc"
): GroupPerformanceRow[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const an =
      av == null || !Number.isFinite(Number(av))
        ? direction === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY
        : Number(av);
    const bn =
      bv == null || !Number.isFinite(Number(bv))
        ? direction === "desc"
          ? Number.NEGATIVE_INFINITY
          : Number.POSITIVE_INFINITY
        : Number(bv);
    if (an === bn) return a.name.localeCompare(b.name);
    return (an - bn) * dir;
  });
}

export type BuildGroupPerformanceReportParams = {
  products: ProductProfitability[];
  dimension: GroupPerformanceDimension;
  /**
   * Category URL filter — applied only for Brand Performance.
   * Category Performance ignores this selector by design.
   */
  category?: string | null;
  currency?: string;
  sortKey?: GroupPerformanceSortKey;
  sortDirection?: "asc" | "desc";
};

/**
 * Build Category or Brand Performance from Financial Engine product rows
 * via the Product Profit projection (single aggregation path).
 */
export function buildGroupPerformanceReport(
  params: BuildGroupPerformanceReportParams
): GroupPerformanceReportView {
  const currency = params.currency ?? "RUB";
  const dimension = params.dimension;

  // Category report ignores category selector; brand report keeps it.
  const productView = buildProductProfitReport({
    products: params.products,
    category: dimension === "brand" ? params.category : undefined,
    currency,
    sortKey: "netProfit" satisfies ProductProfitSortKey,
  });

  const rows = sortGroupRows(
    aggregateProductProfitRows(productView.rows, dimension),
    params.sortKey ?? "netProfit",
    params.sortDirection ?? "desc"
  );

  const { revenue, netProfit, unitsSold, averageMarginPercent } = productView.totals;
  const groupCount = rows.length;

  const groupCountLabel = dimension === "category" ? "Categories" : "Brands";
  const summary: ReportSummaryLine[] = [
    {
      id: "groupCount",
      label: groupCountLabel,
      amount: groupCount,
      isCount: true,
    },
    { id: "revenue", label: "Total Revenue", amount: revenue },
    { id: "netProfit", label: "Total Net Profit", amount: netProfit, isTotal: true },
    {
      id: "netMargin",
      label: "Average Margin %",
      amount: averageMarginPercent,
      isPercent: true,
      isTotal: true,
    },
  ];

  return {
    source: "financialEngine.products.aggregated",
    dimension,
    currency,
    rows,
    summary,
    totals: {
      groupCount,
      revenue,
      netProfit,
      unitsSold,
      averageMarginPercent,
    },
    productRowCount: productView.rows.length,
  };
}
