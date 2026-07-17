import {
  buildExpectedWbPayoutMetricsFromReports,
  loadWbWeeklySalesReports,
} from "@/services/wb-sales-reports-service";
import type { ExpectedWbPayoutMetrics, ScopedDateRange } from "@/types/database";

/**
 * Expected WB Payout — settlement total for realization reports whose period
 * overlaps the dashboard range. Informational only; does not affect P&L.
 */
export async function getExpectedWbPayoutMetrics(
  scope: ScopedDateRange
): Promise<ExpectedWbPayoutMetrics> {
  const loadResult = await loadWbWeeklySalesReports(scope);
  return buildExpectedWbPayoutMetricsFromReports(scope, loadResult);
}
