import {
  buildUnavailableWbSettlement,
  buildWbSettlementFromSources,
  resolveNetForPay,
  resolveSettlementDataAvailability,
} from "@/lib/wb-settlement";
import type { WbSalesReportListItem } from "@/lib/wildberries/types";
import { loadWbWeeklySalesReports, type WbSalesReportsLoadResult } from "@/services/wb-sales-reports-service";
import type { ScopedDateRange, WbFinance, WbSettlementMetrics } from "@/types/database";

/**
 * Settlement metrics. Prefer a single shared weekly-reports load (already widened);
 * only fetch if caller did not preload.
 */
export async function getWbSettlementMetrics(
  scope: ScopedDateRange,
  finance: WbFinance[],
  logistics: number,
  preloadedReports?: WbSalesReportsLoadResult
): Promise<WbSettlementMetrics> {
  let weeklyReports: WbSalesReportListItem[] | undefined;

  if (preloadedReports?.kind === "wildberries") {
    weeklyReports = preloadedReports.reports;
  } else if (preloadedReports?.kind === "unsupported" || preloadedReports?.kind === "error") {
    weeklyReports = undefined;
  } else {
    const loaded = await loadWbWeeklySalesReports(scope);
    weeklyReports = loaded.kind === "wildberries" ? loaded.reports : undefined;
  }

  const availability = resolveSettlementDataAvailability({
    scopeFrom: scope.from,
    scopeTo: scope.to,
    reports: weeklyReports,
    finance,
  });

  if (!availability.available) {
    return buildUnavailableWbSettlement(availability);
  }

  const netForPayResolution = resolveNetForPay({
    finance,
    weeklyReports,
    scopeFrom: scope.from,
    scopeTo: scope.to,
  });

  return buildWbSettlementFromSources(finance, logistics, netForPayResolution, availability);
}
