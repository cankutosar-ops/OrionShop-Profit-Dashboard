/**
 * Logistics Analysis — FE logistics + product ranking for highest logistics SKU.
 */
import type { ReportContext } from "@/lib/reporting/report-context";
import type { ReportSection } from "@/lib/reporting/types";
import {
  percentOfRevenue,
  pickBestProduct,
  type RankedProduct,
} from "@/lib/reporting/section-utils";

export type LogisticsData = {
  logistics: number;
  storage: number;
  acceptance: number;
  averageLogisticsCost: number | null;
  logisticsPercentOfRevenue: number;
  highestLogisticsSku: RankedProduct | null;
  purchaseLogistics: number;
  excludedLogistics: number;
  unitsSold: number;
};

export function buildLogisticsSection(
  ctx: ReportContext
): ReportSection<LogisticsData> {
  const fe = ctx.financialEngine;
  const unitsSold = ctx.overview.quantityMetrics.unitsSold;
  const highestLogisticsSku = pickBestProduct(ctx.products, (p) => p.logistics);

  const purchaseLogistics = ctx.products.reduce((sum, p) => sum + p.purchaseLogistics, 0);
  const excludedLogistics = ctx.products.reduce((sum, p) => sum + p.excludedLogistics, 0);

  return {
    id: "logistics",
    kind: "logistics",
    title: "Logistics Analysis",
    description: "Logistics costs from Financial Engine and product analytics",
    data: {
      logistics: fe.logistics,
      storage: fe.storage,
      acceptance: fe.acceptance,
      averageLogisticsCost: unitsSold > 0 ? fe.logistics / unitsSold : null,
      logisticsPercentOfRevenue: percentOfRevenue(fe.logistics, fe.revenue),
      highestLogisticsSku,
      purchaseLogistics,
      excludedLogistics,
      unitsSold,
    },
  };
}
