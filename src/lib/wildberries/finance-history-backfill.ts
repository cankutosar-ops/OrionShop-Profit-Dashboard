import { syncLog } from "@/lib/wildberries/sync-log";
import type { WbSyncService } from "@/lib/wildberries/sync-service";
import { parseWbSourceSuffix } from "@/lib/finance-category";
import { countFinanceForPayLines, sumNetForPayFromFinance } from "@/lib/wb-settlement";
import type { WbFinance } from "@/types/database";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FinanceBackfillWindow = {
  from: string;
  to: string;
  label: string;
};

export type FinanceBackfillPeriodResult = {
  window: FinanceBackfillWindow;
  apiRowsProcessed: number;
  financeLinesUpserted: number;
  forPayLinesBefore: number;
  forPayLinesAfter: number;
  forPayLinesAdded: number;
  netForPayBefore: number;
  netForPayAfter: number;
  errors: string[];
  skipped: boolean;
};

export type FinanceHistoryBackfillResult = {
  windows: FinanceBackfillPeriodResult[];
  completed: boolean;
  stoppedAt?: string;
  totalApiRows: number;
  totalFinanceLinesUpserted: number;
  totalForPayLinesAdded: number;
};

export type FinanceHistoryBackfillOptions = {
  /** Inclusive start date (YYYY-MM-DD). Default: Jan 1 of endDate year. */
  from?: string;
  /** Inclusive end date (YYYY-MM-DD). Default: today. */
  to?: string;
  /**
   * Window strategy:
   * - `monthly` — calendar months (restart-safe; default)
   * - `rolling30` — consecutive 30-day windows
   * - `single` — one request for the full range (fastest when API allows)
   */
  strategy?: "monthly" | "rolling30" | "single";
  /** Windows already marked complete in durable progress. */
  resumeFromProgress?: Map<string, boolean>;
  /**
   * When true (new-account lifecycle resume), skip completed windows.
   * When false/omitted (manual CLI/API), revalidate previously completed windows.
   */
  skipCompletedWindows?: boolean;
  /** Called after each window completes (may be async — awaited). */
  onPeriodComplete?: (
    result: FinanceBackfillPeriodResult
  ) => void | Promise<void>;
  /** Fetch existing finance rows for before/after counts. */
  fetchFinanceInRange: (
    from: string,
    to: string
  ) => Promise<WbFinance[]>;
  /** Pause between windows to respect WB rate limits (ms). Default 5000. */
  pauseBetweenWindowsMs?: number;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Build consecutive backfill windows from `from` through `to` inclusive. */
export function buildFinanceBackfillWindows(
  from: string,
  to: string,
  strategy: FinanceHistoryBackfillOptions["strategy"] = "monthly"
): FinanceBackfillWindow[] {
  if (strategy === "single") {
    return [{ from, to, label: `${from} → ${to}` }];
  }

  if (strategy === "rolling30") {
    const windows: FinanceBackfillWindow[] = [];
    let cursorEnd = to;
    while (cursorEnd >= from) {
      const cursorStart = minDate(from, addDays(cursorEnd, -29));
      windows.unshift({
        from: cursorStart,
        to: cursorEnd,
        label: `${cursorStart} → ${cursorEnd}`,
      });
      if (cursorStart === from) break;
      cursorEnd = addDays(cursorStart, -1);
    }
    return windows;
  }

  // monthly — oldest first
  const startYear = Number(from.slice(0, 4));
  const startMonth = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  const windows: FinanceBackfillWindow[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const monthStart = year === startYear ? startMonth : 1;
    const monthEnd = year === endYear ? endMonth : 12;

    for (let month = monthStart; month <= monthEnd; month += 1) {
      const windowFrom =
        year === startYear && month === startMonth
          ? from
          : `${year}-${pad(month)}-01`;
      const monthLast = lastDayOfMonth(year, month);
      const windowTo = minDate(
        to,
        `${year}-${pad(month)}-${pad(monthLast)}`
      );
      windows.push({
        from: windowFrom,
        to: windowTo,
        label: `${windowFrom} → ${windowTo}`,
      });
    }
  }

  return windows;
}

export function isNonFatalSyncWarning(message: string): boolean {
  return (
    message.includes("finance_category column missing") ||
    message.includes("run npm run apply:finance-category-migration")
  );
}

export function hasFatalSyncErrors(errors: string[]): boolean {
  return errors.some((e) => !isNonFatalSyncWarning(e));
}

function windowProgressKey(window: FinanceBackfillWindow): string {
  return `${window.from}:${window.to}`;
}

function summarizeFinanceRows(rows: WbFinance[]) {
  const forPayRows = rows.filter(
    (r) => parseWbSourceSuffix(r.source_key, r.wb_source_suffix ?? null) === "for_pay"
  );
  return {
    financeRowCount: rows.length,
    forPayLines: countFinanceForPayLines(rows),
    netForPay: sumNetForPayFromFinance(rows),
    forPayRowCountDirect: forPayRows.length,
  };
}

/**
 * Paginate finance history via consecutive API windows and upsert into wb_finance.
 * Uses existing syncFinance() — upsert on (marketplace_account_id, source_key).
 */
export async function runFinanceHistoryBackfill(
  syncService: WbSyncService,
  options: FinanceHistoryBackfillOptions
): Promise<FinanceHistoryBackfillResult> {
  const endDate = options.to ?? new Date().toISOString().slice(0, 10);
  const year = endDate.slice(0, 4);
  const startDate = options.from ?? `${year}-01-01`;
  const strategy = options.strategy ?? "monthly";
  const windows = buildFinanceBackfillWindows(startDate, endDate, strategy);
  const pauseMs = options.pauseBetweenWindowsMs ?? 30_000;

  syncLog("finance-backfill", "START", {
    from: startDate,
    to: endDate,
    strategy,
    windowCount: windows.length,
  });

  const periodResults: FinanceBackfillPeriodResult[] = [];
  let stoppedAt: string | undefined;

  for (const window of windows) {
    const key = windowProgressKey(window);
    const previouslyCompleted = Boolean(options.resumeFromProgress?.get(key));
    if (previouslyCompleted && options.skipCompletedWindows) {
      syncLog("finance-backfill", "SKIP (lifecycle resume — already completed)", {
        window: window.label,
      });
      const skipped: FinanceBackfillPeriodResult = {
        window,
        apiRowsProcessed: 0,
        financeLinesUpserted: 0,
        forPayLinesBefore: 0,
        forPayLinesAfter: 0,
        forPayLinesAdded: 0,
        netForPayBefore: 0,
        netForPayAfter: 0,
        errors: [],
        skipped: true,
      };
      periodResults.push(skipped);
      await options.onPeriodComplete?.(skipped);
      continue;
    }
    // Manual / revalidation path: never permanently skip delayed WB reports.
    if (previouslyCompleted) {
      syncLog("finance-backfill", "REVALIDATE (previously marked complete)", {
        window: window.label,
      });
    }

    syncLog("finance-backfill", "Processing window", {
      from: window.from,
      to: window.to,
    });

    const beforeRows = await options.fetchFinanceInRange(window.from, window.to);
    const before = summarizeFinanceRows(beforeRows);

    let syncResult;
    try {
      syncResult = await syncService.syncFinance(window.from, window.to);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Finance sync failed";
      stoppedAt = window.label;
      const failed: FinanceBackfillPeriodResult = {
        window,
        apiRowsProcessed: 0,
        financeLinesUpserted: 0,
        forPayLinesBefore: before.forPayLines,
        forPayLinesAfter: before.forPayLines,
        forPayLinesAdded: 0,
        netForPayBefore: before.netForPay,
        netForPayAfter: before.netForPay,
        errors: [message],
        skipped: false,
      };
      periodResults.push(failed);
      await options.onPeriodComplete?.(failed);
      break;
    }

    const afterRows = await options.fetchFinanceInRange(window.from, window.to);
    const after = summarizeFinanceRows(afterRows);

    const periodResult: FinanceBackfillPeriodResult = {
      window,
      apiRowsProcessed: syncResult.recordsProcessed,
      financeLinesUpserted: syncResult.recordsUpdated,
      forPayLinesBefore: before.forPayLines,
      forPayLinesAfter: after.forPayLines,
      forPayLinesAdded: after.forPayLines - before.forPayLines,
      netForPayBefore: before.netForPay,
      netForPayAfter: after.netForPay,
      errors: syncResult.errors,
      skipped: false,
    };

    periodResults.push(periodResult);
    await options.onPeriodComplete?.(periodResult);

    syncLog("finance-backfill", "Window complete", {
      window: window.label,
      apiRows: periodResult.apiRowsProcessed,
      upserted: periodResult.financeLinesUpserted,
      forPayAdded: periodResult.forPayLinesAdded,
      errors: periodResult.errors.length,
    });

    if (hasFatalSyncErrors(syncResult.errors)) {
      stoppedAt = window.label;
      break;
    }

    if (pauseMs > 0 && windows.indexOf(window) < windows.length - 1) {
      await sleep(pauseMs);
    }
  }

  const result: FinanceHistoryBackfillResult = {
    windows: periodResults,
    completed: !stoppedAt,
    stoppedAt,
    totalApiRows: periodResults.reduce((s, p) => s + p.apiRowsProcessed, 0),
    totalFinanceLinesUpserted: periodResults.reduce(
      (s, p) => s + p.financeLinesUpserted,
      0
    ),
    totalForPayLinesAdded: periodResults.reduce(
      (s, p) => s + p.forPayLinesAdded,
      0
    ),
  };

  syncLog("finance-backfill", "END", {
    completed: result.completed,
    stoppedAt: result.stoppedAt,
    totalApiRows: result.totalApiRows,
    totalForPayLinesAdded: result.totalForPayLinesAdded,
  });

  return result;
}
