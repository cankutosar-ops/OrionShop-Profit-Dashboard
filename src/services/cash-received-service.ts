import {
  buildCashReceivedMetricsFromReports,
  loadWbWeeklySalesReports,
} from "@/services/wb-sales-reports-service";
import type { CashReceivedMetrics, ScopedDateRange } from "@/types/database";

/**
 * Cash Received — informational cash-flow KPI only.
 * Does not affect Revenue, Net Profit, or any P&L calculation.
 */
export async function getCashReceivedMetrics(scope: ScopedDateRange): Promise<CashReceivedMetrics> {
  const loadResult = await loadWbWeeklySalesReports(scope);
  return buildCashReceivedMetricsFromReports(scope, loadResult);
}
