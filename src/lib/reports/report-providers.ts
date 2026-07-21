import { getOverviewMetrics } from "@/services/dashboard-service";
import type { ScopedDateRange } from "@/types/database";
import type {
  BusinessReportKpiData,
  ReportSection,
} from "@/lib/reports/report-engine-types";

/**
 * Thin adapters to existing dashboard services.
 * Providers must not calculate business math.
 */

export async function provideBusinessReportKpis(
  scope: ScopedDateRange
): Promise<ReportSection<BusinessReportKpiData>> {
  const overview = await getOverviewMetrics(scope);

  return {
    id: "business-kpis",
    titleKey: "report.business.kpis",
    data: {
      revenue: overview.revenue,
      profit: overview.netProfit,
      orders: overview.ordersPurchases.ordersCount,
      purchases: overview.ordersPurchases.purchasesCount,
    },
  };
}

/** No-data probe from trusted overview KPIs — no parallel emptiness formula. */
export function isBusinessReportEmpty(kpis: BusinessReportKpiData): boolean {
  return (
    kpis.revenue === 0 &&
    kpis.profit === 0 &&
    kpis.orders === 0 &&
    kpis.purchases === 0
  );
}
