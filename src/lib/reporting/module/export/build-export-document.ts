/**
 * Build ReportExportDocument from report views — presentation mapping only.
 * Never recalculates Financial Engine values.
 */

import type { ReportSummaryLine } from "@/components/reporting/report-summary-cards";
import type { ReportContextTenant } from "@/lib/reporting/report-context";
import type {
  ReportExportColumn,
  ReportExportDocument,
  ReportExportFilter,
  ReportExportSummaryItem,
  ReportExportValueType,
} from "@/lib/reporting/module/export/export-document";
import type { PnLLine } from "@/lib/reporting/module/pnl-report";
import type { SettlementLine } from "@/lib/reporting/module/settlement-report";
import type { ProductProfitReportRow } from "@/lib/reporting/module/product-profit-report";
import type {
  GroupPerformanceDimension,
  GroupPerformanceRow,
} from "@/lib/reporting/module/group-performance-report";

type TenantSlice = Pick<
  ReportContextTenant,
  "companyName" | "marketplaceLabel" | "currency"
>;

type BuildMetaInput = {
  tenant: TenantSlice;
  dateFrom: string;
  dateTo: string;
  filters?: ReportExportFilter[];
};

function mapSummary(lines: ReportSummaryLine[]): ReportExportSummaryItem[] {
  return lines.map((l) => {
    let type: ReportExportValueType = "currency";
    if (l.isPercent) type = "percent";
    else if (l.isCount) type = "integer";
    return { id: l.id, label: l.label, value: l.amount, type };
  });
}

function baseDoc(
  params: BuildMetaInput & {
    reportId: string;
    title: string;
    summary: ReportExportSummaryItem[];
    columns: ReportExportColumn[];
    rows: ReportExportDocument["rows"];
  }
): ReportExportDocument {
  return {
    reportId: params.reportId,
    title: params.title,
    generatedAt: new Date().toISOString(),
    currency: params.tenant.currency || "RUB",
    meta: {
      company: params.tenant.companyName,
      marketplace: params.tenant.marketplaceLabel,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      filters: params.filters ?? [],
    },
    summary: params.summary,
    columns: params.columns,
    rows: params.rows,
  };
}

/** Line reports (P&L / Settlement): Label + Amount; percent lines use percent type via Amount %. */
function lineAmountType(isPercent?: boolean): ReportExportValueType {
  return isPercent ? "percent" : "currency";
}

export function buildPnLExportDocument(params: {
  tenant: TenantSlice;
  dateFrom: string;
  dateTo: string;
  category?: string | null;
  source: string;
  lines: PnLLine[];
  summaryLines: PnLLine[];
}): ReportExportDocument {
  const filters: ReportExportFilter[] = [{ label: "Source", value: params.source }];
  if (params.category) filters.push({ label: "Category", value: params.category });

  // Mixed currency/percent in one column — export as two columns for correct formatting.
  return baseDoc({
    reportId: "profit-loss",
    title: "Profit & Loss",
    tenant: params.tenant,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    filters,
    summary: params.summaryLines.map((l) => ({
      id: l.id,
      label: l.label,
      value: l.amount,
      type: lineAmountType(l.isPercent),
    })),
    columns: [
      { key: "label", header: "Line", type: "text" },
      { key: "amount", header: "Amount", type: "currency" },
      { key: "percent", header: "Percent", type: "percent" },
    ],
    rows: params.lines.map((l) => ({
      label: l.label,
      amount: l.isPercent ? null : l.amount,
      percent: l.isPercent ? l.amount : null,
    })),
  });
}

export function buildSettlementExportDocument(params: {
  tenant: TenantSlice;
  dateFrom: string;
  dateTo: string;
  category?: string | null;
  source: string;
  lines: SettlementLine[];
  summaryLines: SettlementLine[];
}): ReportExportDocument {
  const filters: ReportExportFilter[] = [{ label: "Source", value: params.source }];
  if (params.category) filters.push({ label: "Category", value: params.category });

  return baseDoc({
    reportId: "settlement",
    title: "Settlement",
    tenant: params.tenant,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    filters,
    summary: params.summaryLines.map((l) => ({
      id: l.id,
      label: l.label,
      value: l.amount,
      type: "currency" as const,
    })),
    columns: [
      { key: "section", header: "Section", type: "text" },
      { key: "label", header: "Line", type: "text" },
      { key: "amount", header: "Amount", type: "currency" },
    ],
    rows: params.lines.map((l) => ({
      section: l.section,
      label: l.label,
      amount: l.amount,
    })),
  });
}

const PRODUCT_COLUMNS: ReportExportColumn[] = [
  { key: "sku", header: "SKU", type: "text" },
  { key: "productName", header: "Product Name", type: "text" },
  { key: "brand", header: "Brand", type: "text" },
  { key: "category", header: "Category", type: "text" },
  { key: "unitsSold", header: "Units Sold", type: "integer" },
  { key: "unitsReturned", header: "Returned Units", type: "integer" },
  { key: "netUnits", header: "Net Units", type: "integer" },
  { key: "netSales", header: "Net Sales", type: "currency" },
  { key: "revenue", header: "Revenue", type: "currency" },
  { key: "productCost", header: "Product Cost", type: "currency" },
  { key: "marketplaceFees", header: "Marketplace Fee", type: "currency" },
  { key: "logistics", header: "Logistics", type: "currency" },
  { key: "storage", header: "Storage", type: "currency" },
  { key: "penalties", header: "Penalties", type: "currency" },
  { key: "adjustments", header: "Adjustments", type: "currency" },
  { key: "advertising", header: "Advertising", type: "currency" },
  { key: "estimatedTax", header: "Estimated Tax", type: "currency" },
  { key: "netProfit", header: "Net Profit", type: "currency" },
  { key: "netMarginPercent", header: "Net Margin %", type: "percent" },
  { key: "roiPercent", header: "ROI", type: "percent" },
];

export function buildProductProfitExportDocument(params: {
  tenant: TenantSlice;
  dateFrom: string;
  dateTo: string;
  category?: string | null;
  source: string;
  rows: ProductProfitReportRow[];
  summary: ReportSummaryLine[];
}): ReportExportDocument {
  const filters: ReportExportFilter[] = [{ label: "Source", value: params.source }];
  if (params.category) filters.push({ label: "Category", value: params.category });

  return baseDoc({
    reportId: "product-profit",
    title: "Product Profit",
    tenant: params.tenant,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    filters,
    summary: mapSummary(params.summary),
    columns: PRODUCT_COLUMNS,
    rows: params.rows.map((r) => ({
      sku: r.sku,
      productName: r.productName,
      brand: r.brand,
      category: r.category,
      unitsSold: r.unitsSold,
      unitsReturned: r.unitsReturned,
      netUnits: r.netUnits,
      netSales: r.netSales,
      revenue: r.revenue,
      productCost: r.productCost,
      marketplaceFees: r.marketplaceFees,
      logistics: r.logistics,
      storage: r.storage,
      penalties: r.penalties,
      adjustments: r.adjustments,
      advertising: r.advertising,
      estimatedTax: r.estimatedTax,
      netProfit: r.netProfit,
      netMarginPercent: r.netMarginPercent,
      roiPercent: r.roiPercent,
    })),
  });
}

export function buildGroupPerformanceExportDocument(params: {
  reportId: "category-performance" | "brand-performance";
  title: string;
  dimension: GroupPerformanceDimension;
  tenant: TenantSlice;
  dateFrom: string;
  dateTo: string;
  filters?: ReportExportFilter[];
  rows: GroupPerformanceRow[];
  summary: ReportSummaryLine[];
}): ReportExportDocument {
  const nameHeader = params.dimension === "category" ? "Category" : "Brand";
  const columns: ReportExportColumn[] = [
    { key: "name", header: nameHeader, type: "text" },
    { key: "productCount", header: "Products", type: "integer" },
    { key: "unitsSold", header: "Units Sold", type: "integer" },
    { key: "netSales", header: "Net Sales", type: "currency" },
    { key: "revenue", header: "Revenue", type: "currency" },
    { key: "productCost", header: "Product Cost", type: "currency" },
    { key: "marketplaceFees", header: "Marketplace Fees", type: "currency" },
    { key: "logistics", header: "Logistics", type: "currency" },
    { key: "storage", header: "Storage", type: "currency" },
    { key: "adjustments", header: "Adjustments", type: "currency" },
    { key: "advertising", header: "Advertising", type: "currency" },
    { key: "netProfit", header: "Net Profit", type: "currency" },
    { key: "netMarginPercent", header: "Net Margin %", type: "percent" },
    { key: "roiPercent", header: "ROI", type: "percent" },
  ];

  return baseDoc({
    reportId: params.reportId,
    title: params.title,
    tenant: params.tenant,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    filters: params.filters ?? [],
    summary: mapSummary(params.summary),
    columns,
    rows: params.rows.map((r) => ({
      name: r.name,
      productCount: r.productCount,
      unitsSold: r.unitsSold,
      netSales: r.netSales,
      revenue: r.revenue,
      productCost: r.productCost,
      marketplaceFees: r.marketplaceFees,
      logistics: r.logistics,
      storage: r.storage,
      adjustments: r.adjustments,
      advertising: r.advertising,
      netProfit: r.netProfit,
      netMarginPercent: r.netMarginPercent,
      roiPercent: r.roiPercent,
    })),
  });
}
