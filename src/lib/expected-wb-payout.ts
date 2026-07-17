import type { WbSalesReportListItem } from "@/lib/wildberries/types";
import { expandSalesReportFetchWindow, parseWbMoney } from "@/lib/cash-received";

export { expandSalesReportFetchWindow };

/** Report operational period overlaps the dashboard date range. */
export function reportPeriodOverlaps(
  scopeFrom: string,
  scopeTo: string,
  reportFrom: string,
  reportTo: string
): boolean {
  return reportFrom <= scopeTo && reportTo >= scopeFrom;
}

/**
 * Expected WB Payout — net settlement per realization report (bankPaymentSum).
 * Matches Seller Portal financial reports table for overlapping report periods.
 * Includes negative settlements (e.g. reportType 2).
 */
export function sumExpectedWbPayoutFromSalesReports(
  reports: WbSalesReportListItem[],
  scopeFrom: string,
  scopeTo: string
): { amount: number; reportCount: number } {
  let amount = 0;
  let reportCount = 0;

  for (const report of reports) {
    if (!reportPeriodOverlaps(scopeFrom, scopeTo, report.dateFrom, report.dateTo)) continue;

    amount += parseWbMoney(report.bankPaymentSum);
    reportCount += 1;
  }

  return { amount, reportCount };
}
