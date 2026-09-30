import type { WbSalesReportListItem } from "@/lib/wildberries/types";

export const FINANCE_2026_FROM = "2026-01-01";
export const FINANCE_2026_TO = "2026-09-30";
export const FINANCE_REPORT_MIN_GAP_MS = 70_000;

export type SingleFinance429RetryResult<T> = {
  value: T;
  retryPerformed: boolean;
};

/**
 * Run one Finance operation with a single, bounded 429 retry.
 *
 * The first 429 waits at least the established 70-second Finance gap. The
 * second attempt is final: a returned 429 result is handed back to the caller,
 * while a thrown 429 is re-thrown. There is no loop or background restart.
 */
export async function runWithSingleFinance429Retry<T>(input: {
  operation: () => Promise<T>;
  is429: (valueOrError: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;
  onRetry?: (waitMs: number) => void;
}): Promise<SingleFinance429RetryResult<T>> {
  const waitMs = Math.max(
    FINANCE_REPORT_MIN_GAP_MS,
    Number.isFinite(input.waitMs) ? Number(input.waitMs) : 0
  );
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  try {
    const first = await input.operation();
    if (!input.is429(first)) return { value: first, retryPerformed: false };
  } catch (error) {
    if (!input.is429(error)) throw error;
  }

  input.onRetry?.(waitMs);
  await sleep(waitMs);
  return { value: await input.operation(), retryPerformed: true };
}

export type FinanceWeeklyReportType = "general" | "purchase" | "unknown";

export type FinanceWeeklyReportPlanItem = {
  reportId: number;
  reportType: number | null;
  reportTypeName: FinanceWeeklyReportType;
  dateFrom: string;
  dateTo: string;
  forPaySum: number | null;
};

export type FinanceBackfillWindow = {
  from: string;
  to: string;
};

/** Inclusive, consecutive windows of at most seven calendar days. */
export function buildFinanceBackfillWindows(
  from: string,
  to: string
): FinanceBackfillWindow[] {
  assertFinance2026Range(from, to);
  const windows: FinanceBackfillWindow[] = [];
  let cursor = new Date(`${from}T12:00:00Z`);
  const final = new Date(`${to}T12:00:00Z`);

  while (cursor <= final) {
    const windowFrom = cursor.toISOString().slice(0, 10);
    const windowEnd = new Date(cursor);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + 6);
    if (windowEnd > final) windowEnd.setTime(final.getTime());
    windows.push({ from: windowFrom, to: windowEnd.toISOString().slice(0, 10) });
    cursor = new Date(windowEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return windows;
}

export function financeWeeklyReportTypeName(
  reportType: number | null | undefined
): FinanceWeeklyReportType {
  if (reportType === 1) return "general";
  if (reportType === 2) return "purchase";
  return "unknown";
}

export function parseFinanceControlMoney(
  value: string | number | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

export function assertFinance2026Range(from: string, to: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error("Finance backfill dates must use YYYY-MM-DD");
  }
  if (from < FINANCE_2026_FROM || to > FINANCE_2026_TO || from > to) {
    throw new Error(
      `Finance backfill is restricted to ${FINANCE_2026_FROM}..${FINANCE_2026_TO}`
    );
  }
}

/**
 * Build the deterministic weekly report worklist returned by Reports V1 list.
 * General and Purchase remain separate report IDs; no SRID-level collapse occurs.
 */
export function buildFinanceWeeklyReportPlan(input: {
  reports: WbSalesReportListItem[];
  from: string;
  to: string;
}): FinanceWeeklyReportPlanItem[] {
  assertFinance2026Range(input.from, input.to);
  const byId = new Map<number, FinanceWeeklyReportPlanItem>();

  for (const report of input.reports) {
    const reportId = Number(report.reportId);
    const dateFrom = isoDate(report.dateFrom);
    const dateTo = isoDate(report.dateTo);
    if (!Number.isSafeInteger(reportId) || reportId <= 0) {
      throw new Error(`Invalid weekly Finance reportId: ${String(report.reportId)}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      throw new Error(`Invalid period on Finance report ${reportId}`);
    }
    if (dateFrom < input.from || dateTo > input.to) continue;

    const reportType = Number.isSafeInteger(Number(report.reportType))
      ? Number(report.reportType)
      : null;
    const item: FinanceWeeklyReportPlanItem = {
      reportId,
      reportType,
      reportTypeName: financeWeeklyReportTypeName(reportType),
      dateFrom,
      dateTo,
      forPaySum: parseFinanceControlMoney(report.forPaySum),
    };
    const existing = byId.get(reportId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(item)) {
      throw new Error(`Conflicting duplicate Finance reportId ${reportId}`);
    }
    byId.set(reportId, item);
  }

  return [...byId.values()].sort(
    (a, b) =>
      a.dateFrom.localeCompare(b.dateFrom) ||
      a.dateTo.localeCompare(b.dateTo) ||
      (a.reportType ?? 99) - (b.reportType ?? 99) ||
      a.reportId - b.reportId
  );
}

export function financeControlTotalMatches(
  expected: number | null,
  actual: number,
  tolerance = 0.01
): boolean {
  return expected != null && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}
