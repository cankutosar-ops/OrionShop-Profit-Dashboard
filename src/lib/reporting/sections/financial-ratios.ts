/**
 * Financial Ratios — presentation ratios from FE + overview KPIs.
 * Period-independent: always relative to the selected ReportContext scope.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  averagePerUnit,
  netMarginPercent,
  percentOfRevenue,
} from "@/lib/reporting/section-utils";

export type FinancialRatioLine = {
  id: string;
  label: string;
  value: number | null;
  format: "percent" | "currency";
};

export type FinancialRatiosData = {
  revenueBase: number;
  unitsSold: number;
  ratios: FinancialRatioLine[];
};

export function buildFinancialRatiosSection(
  ctx: ReportContext
): ReportSection<FinancialRatiosData> {
  const fe = ctx.financialEngine;
  const op = ctx.overview.ordersPurchases;
  const unitsSold = ctx.overview.quantityMetrics.unitsSold;
  const revenue = fe.revenue;

  const ratios: FinancialRatioLine[] = [
    {
      id: "marketplaceFeePercent",
      label: "Marketplace Fee %",
      value: percentOfRevenue(fe.marketplaceFee ?? fe.commission, revenue),
      format: "percent",
    },
    {
      id: "logisticsPercent",
      label: "Logistics %",
      value: percentOfRevenue(fe.logistics, revenue),
      format: "percent",
    },
    {
      id: "storagePercent",
      label: "Storage %",
      value: percentOfRevenue(fe.storage, revenue),
      format: "percent",
    },
    {
      id: "acceptancePercent",
      label: "Acceptance %",
      value: percentOfRevenue(fe.acceptance, revenue),
      format: "percent",
    },
    {
      id: "penaltiesPercent",
      label: "Penalties %",
      value: percentOfRevenue(fe.penalties, revenue),
      format: "percent",
    },
    {
      id: "estimatedTaxPercent",
      label: "Estimated Tax %",
      value: percentOfRevenue(fe.estimatedTax, revenue),
      format: "percent",
    },
    {
      id: "operatingMarginPercent",
      label: "Operating Margin %",
      value: netMarginPercent(revenue, fe.operatingProfit ?? fe.netProfit),
      format: "percent",
    },
    {
      id: "netMarginPercent",
      label: "Net Margin %",
      value: netMarginPercent(revenue, fe.finalNetProfit),
      format: "percent",
    },
    {
      id: "returnRatePercent",
      label: "Return Rate %",
      value: op.returnRate,
      format: "percent",
    },
    {
      id: "averageOrderValue",
      label: "Average Order Value",
      value: averagePerUnit(op.ordersAmount, op.ordersCount),
      format: "currency",
    },
    {
      id: "averageSellingPrice",
      label: "Average Selling Price",
      value: averagePerUnit(revenue, unitsSold),
      format: "currency",
    },
    {
      id: "averageProfitPerUnit",
      label: "Average Profit per Unit",
      value: averagePerUnit(fe.finalNetProfit, unitsSold),
      format: "currency",
    },
  ];

  return {
    id: "financial-ratios",
    kind: "financial-ratios",
    title: "Financial Ratios",
    description: "Management ratios for the selected reporting period",
    data: {
      revenueBase: revenue,
      unitsSold,
      ratios,
    },
  };
}
