/**
 * Sprint 9.3 — Product Profit Report projection from Financial Engine product rows.
 * Presentation only — maps ProductProfitability outputs; never recalculates engine math.
 *
 * Recommended Price is optional/read-only when supplied from an existing source.
 * Reporting never invokes Smart Pricing solvers.
 *
 * ROI (presentation) = Final Net Profit ÷ Product Cost × 100 when cost > 0.
 * Same ratio identity as historical Markup on Cost (engine outputs only).
 */

import { calculateModelBMarginPercent } from "@/lib/financial-engine";
import { filterProductsByCategory } from "@/lib/reporting/module/pnl-report";
import type { ProductProfitability } from "@/types/database";
import type { ReportSummaryLine } from "@/components/reporting/report-summary-cards";

export type ProductProfitSortKey =
  | "netProfit"
  | "netMarginPercent"
  | "revenue"
  | "unitsSold"
  | "roiPercent";

export type ProductProfitReportRow = {
  productId: string;
  sku: string;
  productName: string;
  brand: string;
  category: string;
  unitsSold: number;
  unitsReturned: number;
  netUnits: number;
  netSales: number;
  revenue: number;
  productCost: number;
  marketplaceFees: number;
  /** Outbound + return logistics (engine fields summed for display). */
  logistics: number;
  storage: number;
  penalties: number;
  adjustments: number;
  advertising: number;
  /** Operating profit before tax (engine `netProfit`). */
  operatingProfit: number;
  /** estimatedTax presentation = operating − final (engine outputs only). */
  estimatedTax: number;
  /** Model B Final Net Profit. */
  netProfit: number;
  /** Model B margin % of Revenue. */
  netMarginPercent: number;
  /** Net Profit ÷ Product Cost × 100; null when cost ≤ 0. */
  roiPercent: number | null;
  /** Existing recommended price when available; never computed here. */
  recommendedPrice: number | null;
};

export type ProductProfitReportView = {
  source: "financialEngine.products";
  currency: string;
  rows: ProductProfitReportRow[];
  summary: ReportSummaryLine[];
  totals: {
    revenue: number;
    netProfit: number;
    unitsSold: number;
    averageMarginPercent: number;
  };
};

/**
 * ROI from engine outputs only — identical formula for every row.
 * Does not invent cost bases or pull Smart Pricing unit costs.
 */
export function calculateProductRoiPercent(
  netProfit: number,
  productCost: number
): number | null {
  if (!(productCost > 0) || !Number.isFinite(netProfit) || !Number.isFinite(productCost)) {
    return null;
  }
  return (netProfit / productCost) * 100;
}

function mapRow(
  product: ProductProfitability,
  recommendedPrice: number | null
): ProductProfitReportRow {
  const netProfit = product.finalNetProfit;
  const operatingProfit = product.netProfit;
  const revenue = product.revenue;
  const unitsSold = product.unitsSold;
  const unitsReturned = product.unitsReturned;
  return {
    productId: product.productId,
    sku: product.modelCode || "—",
    productName: product.productName || "—",
    brand: product.brandName || "—",
    category: product.categoryName || "—",
    unitsSold,
    unitsReturned,
    netUnits: unitsSold - unitsReturned,
    netSales: product.netSales,
    revenue,
    productCost: product.productCost,
    marketplaceFees: product.marketplaceFees,
    logistics: product.logistics + product.returnLogistics,
    storage: product.storage,
    penalties: product.penalties,
    adjustments: product.accountAdjustments,
    advertising: product.advertising,
    operatingProfit,
    estimatedTax: operatingProfit - netProfit,
    netProfit,
    netMarginPercent: calculateModelBMarginPercent(revenue, netProfit),
    roiPercent: calculateProductRoiPercent(netProfit, product.productCost),
    recommendedPrice,
  };
}

function sortRows(
  rows: ProductProfitReportRow[],
  sortKey: ProductProfitSortKey = "netProfit",
  direction: "asc" | "desc" = "desc"
): ProductProfitReportRow[] {
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
    if (an === bn) return a.sku.localeCompare(b.sku);
    return (an - bn) * dir;
  });
}

export type BuildProductProfitReportParams = {
  products: ProductProfitability[];
  category?: string | null;
  currency?: string;
  /** Optional map of existing recommended prices (Smart Pricing cache / etc.). */
  recommendedPricesByProductId?: ReadonlyMap<string, number | null> | Record<string, number | null>;
  /** Default: highest Net Profit first. */
  sortKey?: ProductProfitSortKey;
  sortDirection?: "asc" | "desc";
};

function isRecommendedPriceMap(
  value: NonNullable<BuildProductProfitReportParams["recommendedPricesByProductId"]>
): value is ReadonlyMap<string, number | null> {
  return value instanceof Map;
}

function lookupRecommendedPrice(
  productId: string,
  map?: BuildProductProfitReportParams["recommendedPricesByProductId"]
): number | null {
  if (!map) return null;
  if (isRecommendedPriceMap(map)) {
    const v = map.get(productId);
    return v == null || !Number.isFinite(v) ? null : v;
  }
  const v = map[productId];
  return v == null || !Number.isFinite(v) ? null : v;
}

/**
 * Build Product Profit report view from Financial Engine product profitability rows.
 */
export function buildProductProfitReport(
  params: BuildProductProfitReportParams
): ProductProfitReportView {
  const currency = params.currency ?? "RUB";
  const filtered = filterProductsByCategory(params.products, params.category);

  const rows = sortRows(
    filtered.map((p) =>
      mapRow(p, lookupRecommendedPrice(p.productId, params.recommendedPricesByProductId))
    ),
    params.sortKey ?? "netProfit",
    params.sortDirection ?? "desc"
  );

  let revenue = 0;
  let netProfit = 0;
  let unitsSold = 0;
  for (const row of rows) {
    revenue += row.revenue;
    netProfit += row.netProfit;
    unitsSold += row.unitsSold;
  }

  const averageMarginPercent = calculateModelBMarginPercent(revenue, netProfit);

  const summary: ReportSummaryLine[] = [
    { id: "revenue", label: "Total Revenue", amount: revenue },
    { id: "netProfit", label: "Total Net Profit", amount: netProfit, isTotal: true },
    {
      id: "netMargin",
      label: "Average Margin",
      amount: averageMarginPercent,
      isPercent: true,
      isTotal: true,
    },
    { id: "unitsSold", label: "Total Units Sold", amount: unitsSold, isCount: true },
  ];

  return {
    source: "financialEngine.products",
    currency,
    rows,
    summary,
    totals: {
      revenue,
      netProfit,
      unitsSold,
      averageMarginPercent,
    },
  };
}
