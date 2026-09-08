/**
 * Account 2 Reports-based Finance recovery — pure helpers (no HTTP, no DB).
 *
 * Source of truth for lines: POST /api/finance/v1/sales-reports/detailed
 * List endpoint is control/reconciliation only — never invent rows from list.
 * Statistics v5 reportDetailByPeriod is forbidden for Account 2 recovery.
 */

import {
  WB_FINANCE_V1_DETAILED_PATH,
  WB_FINANCE_V1_LIST_PATH,
  type WbFinanceV1Period,
} from "@/lib/wildberries/finance-v1";
import { FINANCE_RESERVED_ACCOUNT_IDS } from "@/lib/finance-recovery/reservation";
import type { FinanceRecoveryActiveChunk } from "@/lib/finance-recovery/coordination";

/** Durable marker written into recovery progress when wakes run. */
export const ACCOUNT2_REPORTS_API_SOURCE = "finance_v1_sales_reports_detailed" as const;

export const ACCOUNT2_REPORTS_DETAILED_PATH = WB_FINANCE_V1_DETAILED_PATH;
export const ACCOUNT2_REPORTS_LIST_PATH = WB_FINANCE_V1_LIST_PATH;

/** Forbidden Statistics v5 path — must never appear as Account 2 recovery source. */
export const ACCOUNT2_FORBIDDEN_STATISTICS_V5_PATH =
  "/api/v5/supplier/reportDetailByPeriod";

export type ReportsWeekState = {
  periodFrom: string;
  periodTo: string;
  period: WbFinanceV1Period;
  key: string;
  status: FinanceRecoveryActiveChunk["status"] | "completed";
  currentPage: number;
  lastPersistedRrdId: number;
  completedPages: FinanceRecoveryActiveChunk["completedPages"];
  reportIdsSeen: number[];
  apiSource: typeof ACCOUNT2_REPORTS_API_SOURCE;
};

export function reportsWeekKey(periodFrom: string, periodTo: string): string {
  return `${periodFrom}:${periodTo}`;
}

/**
 * Build durable week state from the active recovery chunk (or defaults for next week).
 * Pure — does not read/write disk.
 */
export function buildReportsWeekState(input: {
  periodFrom: string;
  periodTo: string;
  period?: WbFinanceV1Period;
  activeChunk?: FinanceRecoveryActiveChunk | null;
  reportIdsSeen?: number[];
}): ReportsWeekState {
  const key = reportsWeekKey(input.periodFrom, input.periodTo);
  const chunk = input.activeChunk;
  const matches =
    chunk != null &&
    chunk.chunkFrom === input.periodFrom &&
    chunk.chunkTo === input.periodTo;

  return {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    period: input.period ?? "weekly",
    key,
    status: matches ? chunk.status : "in_progress",
    currentPage: matches ? chunk.currentPage : 1,
    lastPersistedRrdId: matches ? chunk.lastPersistedRrdId : 0,
    completedPages: matches ? [...chunk.completedPages] : [],
    reportIdsSeen: [...(input.reportIdsSeen ?? [])],
    apiSource: ACCOUNT2_REPORTS_API_SOURCE,
  };
}

/** Next intended Account 2 recovery week after MAX 2026-06-28. */
export const ACCOUNT2_NEXT_REPORTS_WEEK = {
  from: "2026-06-29",
  to: "2026-07-05",
  rrdId: 0,
  period: "weekly" as const,
};

/** One calendar week advancement (7-day inclusive periods). */
export function addIsoDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Next weekly period after a completed week.
 * Example: 2026-06-29→2026-07-05 → 2026-07-06→2026-07-12
 */
export function nextWeeklyReportsPeriod(input: {
  periodFrom: string;
  periodTo: string;
}): { from: string; to: string; key: string; rrdId: number; period: "weekly" } {
  const from = addIsoDays(input.periodTo, 1);
  const to = addIsoDays(from, 6);
  return {
    from,
    to,
    key: reportsWeekKey(from, to),
    rrdId: 0,
    period: "weekly",
  };
}

export function isReportsWeekCompleteInProgress(input: {
  completedChunks?: Record<string, unknown> | null;
  weekKey: string;
}): boolean {
  return Boolean(input.completedChunks?.[input.weekKey]);
}

/**
 * Fail closed: next week must not start until previous week key is in completedChunks.
 */
export function assertPreviousReportsWeekComplete(input: {
  completedChunks?: Record<string, unknown> | null;
  previousWeekKey: string;
  nextWeekKey: string;
}): void {
  if (input.previousWeekKey === input.nextWeekKey) {
    throw new Error("Reports week advance refused: previous and next week keys are identical");
  }
  if (!isReportsWeekCompleteInProgress({
    completedChunks: input.completedChunks,
    weekKey: input.previousWeekKey,
  })) {
    throw new Error(
      `Reports week advance refused: previous week ${input.previousWeekKey} is not complete — cannot start ${input.nextWeekKey}`
    );
  }
}

/**
 * Resolve the next incomplete week from a chronological chunk list + completed map.
 * Does not invent weeks beyond the provided worklist.
 */
export function resolveNextIncompleteReportsWeek(input: {
  weeks: Array<{ from: string; to: string }>;
  completedChunks?: Record<string, unknown> | null;
}): { from: string; to: string; key: string } | null {
  for (const week of input.weeks) {
    const key = reportsWeekKey(week.from, week.to);
    if (!input.completedChunks?.[key]) {
      return { from: week.from, to: week.to, key };
    }
  }
  return null;
}

export function assertAccount2ReportsRecoveryAccount(accountId: string): void {
  if (String(accountId) !== "2") {
    throw new Error(
      `Account 2 Reports recovery refuses marketplace_account_id=${accountId}`
    );
  }
  if (!FINANCE_RESERVED_ACCOUNT_IDS.includes("2")) {
    throw new Error("FINANCE_RESERVED_ACCOUNT_IDS must include Account 2");
  }
}

/**
 * Fail closed if a recovery path would use Statistics v5 or a non-Reports source.
 */
export function assertAccount2RecoveryUsesReportsOnly(input: {
  apiSource?: string | null;
  scriptSource?: string;
}): void {
  const source = input.apiSource ?? input.scriptSource ?? "";
  if (
    source.includes("reportDetailByPeriod") ||
    source.includes("statistics-api") ||
    source.includes("statistics_v5")
  ) {
    throw new Error(
      "Account 2 Finance recovery must not use Statistics v5 reportDetailByPeriod — fail closed"
    );
  }
  if (
    source &&
    source !== ACCOUNT2_REPORTS_API_SOURCE &&
    !source.includes("sales-reports/detailed")
  ) {
    throw new Error(
      `Account 2 Finance recovery apiSource must be Reports detailed (${ACCOUNT2_REPORTS_API_SOURCE}), got: ${source}`
    );
  }
}

export function mergeReportIdsSeen(
  existing: number[] | null | undefined,
  incoming: number[] | null | undefined
): number[] {
  const set = new Set<number>();
  for (const id of existing ?? []) {
    if (Number.isSafeInteger(id)) set.add(id);
  }
  for (const id of incoming ?? []) {
    if (Number.isSafeInteger(id)) set.add(id);
  }
  return [...set].sort((a, b) => a - b);
}

export type ReportsWeekDbTotals = {
  rowCount: number;
  uniqueRrdIds: number;
  uniqueSourceKeys: number;
  forPaySum: number;
  returnForPaySum: number;
  bySuffix: Record<string, number>;
};

export type ReportsWeekListControl = {
  reportIds: number[];
  forPaySum: number | null;
  deliveryServiceSum: number | null;
  paidStorageSum: number | null;
  paidAcceptanceSum: number | null;
  penaltySum: number | null;
  deductionSum: number | null;
  /** Additional list sums when available; never invent. */
  additionalPaymentSum?: number | null;
  retailAmountSum?: number | null;
  bankPaymentSum?: number | null;
};

export type ReportsWeekReconciliation = {
  periodFrom: string;
  periodTo: string;
  reportIds: number[];
  pageCount: number;
  db: ReportsWeekDbTotals;
  list: ReportsWeekListControl | null;
  comparisons: Array<{
    metric: string;
    listValue: number | null;
    dbValue: number | null;
    status: "match" | "mismatch" | "list_unavailable" | "not_applicable";
    note?: string;
  }>;
};

const MONEY_EPS = 0.01;

function cmp(
  metric: string,
  listValue: number | null,
  dbValue: number | null,
  note?: string
): ReportsWeekReconciliation["comparisons"][number] {
  if (listValue == null || !Number.isFinite(listValue)) {
    return { metric, listValue: null, dbValue, status: "list_unavailable", note };
  }
  if (dbValue == null || !Number.isFinite(dbValue)) {
    return { metric, listValue, dbValue: null, status: "mismatch", note };
  }
  const ok = Math.abs(dbValue - listValue) <= MONEY_EPS;
  return {
    metric,
    listValue,
    dbValue,
    status: ok ? "match" : "mismatch",
    note,
  };
}

/**
 * Offline week reconciliation scaffold.
 * Does not invent tolerance beyond ₽0.01 float noise for money parse.
 * Logistics: deliveryService → delivery_rub mapping proven (2026-09 YTD audit); deliveryAmount is count.
 */
export function buildReportsWeekReconciliation(input: {
  periodFrom: string;
  periodTo: string;
  pageCount: number;
  db: ReportsWeekDbTotals;
  list: ReportsWeekListControl | null;
}): ReportsWeekReconciliation {
  const list = input.list;
  const comparisons: ReportsWeekReconciliation["comparisons"] = [];

  comparisons.push(
    cmp(
      "forPay / for_pay (Revenue)",
      list?.forPaySum ?? null,
      input.db.forPaySum,
      "Canonical Revenue = Σ Finance for_pay"
    )
  );
  comparisons.push(
    cmp("paidStorageSum / storage", list?.paidStorageSum ?? null, input.db.bySuffix.storage ?? 0)
  );
  comparisons.push(
    cmp(
      "paidAcceptanceSum / acceptance",
      list?.paidAcceptanceSum ?? null,
      input.db.bySuffix.acceptance ?? 0
    )
  );
  comparisons.push(
    cmp("penaltySum / penalty", list?.penaltySum ?? null, input.db.bySuffix.penalty ?? 0)
  );
  comparisons.push(
    cmp("deductionSum / deduction", list?.deductionSum ?? null, input.db.bySuffix.deduction ?? 0)
  );
  comparisons.push({
    metric: "deliveryServiceSum / logistics",
    listValue: list?.deliveryServiceSum ?? null,
    dbValue: input.db.bySuffix.logistics ?? 0,
    status: "not_applicable",
    note: "UNCERTAIN mapping: deliveryService/deliveryAmount must not invent delivery_rub",
  });
  comparisons.push({
    metric: "return for_pay signed total",
    listValue: null,
    dbValue: input.db.returnForPaySum,
    status: "list_unavailable",
    note: "List does not expose return-only forPay; DB signed for_pay < 0 reported for audit",
  });

  return {
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    reportIds: list?.reportIds ?? [],
    pageCount: input.pageCount,
    db: input.db,
    list,
    comparisons,
  };
}

/** Aggregate finance lines offline (e.g. from fixtures) into week DB totals. */
export function aggregateFinanceLinesForWeekRecon(
  lines: Array<{
    source_key?: string | null;
    rrd_id?: number | null;
    wb_source_suffix?: string | null;
    amount?: number | null;
  }>
): ReportsWeekDbTotals {
  const sourceKeys = new Set<string>();
  const rrdIds = new Set<number>();
  const bySuffix: Record<string, number> = {};
  let forPaySum = 0;
  let returnForPaySum = 0;

  for (const line of lines) {
    if (line.source_key) sourceKeys.add(String(line.source_key));
    if (line.rrd_id != null && Number.isSafeInteger(Number(line.rrd_id))) {
      rrdIds.add(Number(line.rrd_id));
    }
    const suffix = String(line.wb_source_suffix ?? "");
    const amount = Number(line.amount ?? 0);
    if (!Number.isFinite(amount)) continue;
    bySuffix[suffix] = (bySuffix[suffix] ?? 0) + amount;
    if (suffix === "for_pay") {
      forPaySum += amount;
      if (amount < 0) returnForPaySum += amount;
    }
  }

  return {
    rowCount: lines.length,
    uniqueRrdIds: rrdIds.size,
    uniqueSourceKeys: sourceKeys.size,
    forPaySum,
    returnForPaySum,
    bySuffix,
  };
}
