/**
 * Executive Summary — factual management overview from ReportContext only.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  netMarginPercent,
  pickBestProduct,
  pickWorstProduct,
  type RankedProduct,
} from "@/lib/reporting/section-utils";

export type ExecutiveSummaryData = {
  revenue: number;
  netProfit: number;
  operatingProfit: number;
  marginPercent: number;
  orders: number;
  unitsSold: number;
  unitsReturned: number;
  returnRate: number;
  purchases: number;
  conversionRate: number;
  marketplaceFee: number;
  netSales: number;
  netSalesStatus: string;
  bestPerformingBrand: { name: string; revenue: number; finalNetProfit: number } | null;
  bestProduct: RankedProduct | null;
  worstProduct: RankedProduct | null;
};

export function buildExecutiveSummarySection(
  ctx: ReportContext
): ReportSection<ExecutiveSummaryData> {
  const fe = ctx.financialEngine;
  const op = ctx.overview.ordersPurchases;
  const qty = ctx.overview.quantityMetrics;

  const bestBrand =
    [...ctx.brands].sort((a, b) => b.finalNetProfit - a.finalNetProfit)[0] ?? null;

  const bestProduct = pickBestProduct(ctx.products, (p) => p.finalNetProfit);
  const worstProduct = pickWorstProduct(ctx.products, (p) => p.finalNetProfit);

  return {
    id: "executive-summary",
    kind: "executive-summary",
    title: "Executive Summary",
    description: "Factual management overview for the selected period",
    data: {
      revenue: fe.revenue,
      netProfit: fe.finalNetProfit,
      operatingProfit: fe.operatingProfit ?? fe.netProfit,
      marginPercent: netMarginPercent(fe.revenue, fe.finalNetProfit),
      orders: op.ordersCount,
      unitsSold: qty.unitsSold,
      unitsReturned: qty.unitsReturned,
      returnRate: op.returnRate,
      purchases: op.purchasesCount,
      conversionRate: op.conversionRate,
      marketplaceFee: fe.marketplaceFee ?? fe.commission,
      netSales: fe.netSales,
      netSalesStatus: fe.netSalesStatus,
      bestPerformingBrand: bestBrand
        ? {
            name: bestBrand.name,
            revenue: bestBrand.revenue,
            finalNetProfit: bestBrand.finalNetProfit,
          }
        : null,
      bestProduct,
      worstProduct,
    },
  };
}
