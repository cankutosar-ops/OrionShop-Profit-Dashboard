import type { WbSalesReportListItem } from "@/lib/wildberries/types";

/** Parse WB finance API money strings (v1 returns string amounts). */
export function parseWbMoney(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number.parseFloat(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateKey(value: string): string {
  return value.slice(0, 10);
}

/** Widen report-period query so weekly payouts + settlement lookback share one WB fetch. */
export function expandSalesReportFetchWindow(from: string, to: string): { fetchFrom: string; fetchTo: string } {
  const start = new Date(`${from}T00:00:00`);
  // 60d lookback covers settlement "latest realization report" discovery (was a second WB call).
  start.setDate(start.getDate() - 60);
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 7);
  return {
    fetchFrom: start.toISOString().slice(0, 10),
    fetchTo: end.toISOString().slice(0, 10),
  };
}

/**
 * Sum WB bank transfers whose payment date (createDate) falls in the dashboard range.
 * Uses bankPaymentSum — actual amount transferred to the seller's bank account per report.
 */
export function sumCashReceivedFromSalesReports(
  reports: WbSalesReportListItem[],
  paymentDateFrom: string,
  paymentDateTo: string
): { amount: number; payoutCount: number } {
  let amount = 0;
  let payoutCount = 0;

  for (const report of reports) {
    const paymentDate = toDateKey(report.createDate);
    if (paymentDate < paymentDateFrom || paymentDate > paymentDateTo) continue;

    const bankPayment = parseWbMoney(report.bankPaymentSum);
    if (bankPayment <= 0) continue;

    amount += bankPayment;
    payoutCount += 1;
  }

  return { amount, payoutCount };
}
