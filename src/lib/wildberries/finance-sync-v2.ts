/**
 * Finance Sync Architecture V2
 *
 * Always re-downloads a configurable lookback window (default 14 days).
 * Discovers realization reports via sales-reports/list, upserts detail rows,
 * computes gap/late-report health, and writes durable audit records.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLog } from "@/lib/wildberries/sync-log";
import type { WbSyncService } from "@/lib/wildberries/sync-service";
import type { WbSalesReportListItem } from "@/lib/wildberries/types";
import type { SyncRunStatus, SyncRunTrigger, SyncStatus } from "@/types/database";
import {
  createSyncRun,
  finishSyncRun,
  heartbeatSyncRun,
  recordFinanceSyncReports,
} from "@/services/sync-run-service";
import { touchAccountSyncHeartbeat } from "@/services/marketplace-account-service";

export const DEFAULT_FINANCE_LOOKBACK_DAYS = 14;
export const DEFAULT_FINANCE_GAP_WARN_DAYS = 3;
export const FINANCE_AUTO_RECOVER_COOLDOWN_MS = 60 * 60 * 1000;

export type FinanceSyncV2Options = {
  marketplaceAccountId: string;
  syncService: WbSyncService;
  trigger: SyncRunTrigger;
  requestId?: string | null;
  /** Override lookback; otherwise account → env → 14. */
  lookbackDays?: number;
  /** Optional explicit range (recover). Defaults to [today-lookback, today]. */
  dateFrom?: string;
  dateTo?: string;
  /** Skip auto re-queue when this run is already a recovery. */
  allowAutoRecover?: boolean;
};

export type FinanceSyncV2Result = {
  entity: "finance";
  recordsProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  errors: string[];
  warnings: string[];
  syncedAt: string;
  status: SyncRunStatus;
  syncRunId: string | null;
  lookbackDays: number;
  requestedFrom: string;
  requestedTo: string;
  returnedFrom: string | null;
  returnedTo: string | null;
  reportIds: number[];
  lateReportIds: number[];
  missingDays: string[];
  gapDays: number;
  latestOperationDate: string | null;
  latestReportId: number | null;
  recoveryNeeded: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addUtcDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function diffUtcDays(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00Z`).getTime();
  const b = new Date(`${toIso}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function enumerateDaysInclusive(from: string, to: string): string[] {
  if (from > to) return [];
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addUtcDays(cur, 1);
  }
  return out;
}

export function resolveFinanceLookbackDays(accountLookback?: number | null): number {
  const envRaw = process.env.FINANCE_LOOKBACK_DAYS;
  const envVal = envRaw ? Number(envRaw) : NaN;
  if (Number.isFinite(accountLookback) && (accountLookback as number) > 0) {
    return Math.floor(accountLookback as number);
  }
  if (Number.isFinite(envVal) && envVal > 0) return Math.floor(envVal);
  return DEFAULT_FINANCE_LOOKBACK_DAYS;
}

export function resolveFinanceGapWarnDays(accountGap?: number | null): number {
  const envRaw = process.env.FINANCE_GAP_WARN_DAYS;
  const envVal = envRaw ? Number(envRaw) : NaN;
  if (Number.isFinite(accountGap) && (accountGap as number) >= 0) {
    return Math.floor(accountGap as number);
  }
  if (Number.isFinite(envVal) && envVal >= 0) return Math.floor(envVal);
  return DEFAULT_FINANCE_GAP_WARN_DAYS;
}

export function computeFinanceWindow(lookbackDays: number, today = toIsoDate(new Date())): {
  from: string;
  to: string;
} {
  return {
    from: addUtcDays(today, -(lookbackDays - 1)),
    to: today,
  };
}

function reportCreateDate(item: WbSalesReportListItem): string | null {
  const raw = item.createDate ?? null;
  return raw ? String(raw).slice(0, 10) : null;
}

function reportIdOf(item: WbSalesReportListItem): number | null {
  const id = item.reportId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

async function loadAccountFinanceSettings(accountId: string): Promise<{
  lookbackDays: number;
  gapWarnDays: number;
}> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("marketplace_accounts")
    .select("finance_lookback_days, finance_gap_warn_days")
    .eq("id", accountId)
    .maybeSingle();
  return {
    lookbackDays: resolveFinanceLookbackDays(data?.finance_lookback_days),
    gapWarnDays: resolveFinanceGapWarnDays(data?.finance_gap_warn_days),
  };
}

async function fetchDistinctOperationDates(
  accountId: string,
  from: string,
  to: string
): Promise<Set<string>> {
  const sb = createAdminClient();
  const dates = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("operation_date")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .range(offset, offset + 999);
    if (error) break;
    for (const row of data ?? []) {
      if (row.operation_date) dates.add(String(row.operation_date).slice(0, 10));
    }
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return dates;
}

async function fetchDistinctReportIdsInDb(
  accountId: string,
  from: string,
  to: string
): Promise<Set<number>> {
  const sb = createAdminClient();
  const ids = new Set<number>();
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("wb_finance")
      .select("realizationreport_id")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .not("realizationreport_id", "is", null)
      .range(offset, offset + 999);
    if (error) {
      // Column may be missing before migration — degrade gracefully.
      break;
    }
    for (const row of data ?? []) {
      const id = Number(row.realizationreport_id);
      if (Number.isFinite(id)) ids.add(id);
    }
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return ids;
}

async function fetchLatestOperationDate(accountId: string): Promise<string | null> {
  const sb = createAdminClient();
  const { data } = await sb
    .from("wb_finance")
    .select("operation_date")
    .eq("marketplace_account_id", accountId)
    .order("operation_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.operation_date ? String(data.operation_date).slice(0, 10) : null;
}

async function countSourceKeys(
  _accountId: string,
  _sourceKeys: string[]
): Promise<number> {
  return 0;
}

/** @internal retained for future insert/update differentiation */
void countSourceKeys;

/**
 * Run Finance Sync V2 for one account.
 */
export async function runFinanceSyncV2(
  options: FinanceSyncV2Options
): Promise<FinanceSyncV2Result> {
  const startedAt = new Date().toISOString();
  const settings = await loadAccountFinanceSettings(options.marketplaceAccountId);
  const lookbackDays = options.lookbackDays ?? settings.lookbackDays;
  const gapWarnDays = settings.gapWarnDays;
  const window = computeFinanceWindow(lookbackDays);
  const requestedFrom = options.dateFrom ?? window.from;
  const requestedTo = options.dateTo ?? window.to;
  const warnings: string[] = [];
  const errors: string[] = [];

  syncLog("finance-v2", "START", {
    accountId: options.marketplaceAccountId,
    trigger: options.trigger,
    requestedFrom,
    requestedTo,
    lookbackDays,
  });

  const syncRunId = await createSyncRun({
    marketplaceAccountId: options.marketplaceAccountId,
    requestId: options.requestId ?? null,
    trigger: options.trigger,
    entities: ["finance"],
    requestedFrom,
    requestedTo,
    financeLookbackDays: lookbackDays,
  });

  let discovered: WbSalesReportListItem[] = [];
  try {
    await touchAccountSyncHeartbeat(options.marketplaceAccountId);
    await heartbeatSyncRun(syncRunId);
    discovered = await options.syncService.getApiClient().fetchSalesReportsList(
      requestedFrom,
      requestedTo,
      "weekly"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sales-reports/list failed";
    warnings.push(`report_discovery: ${msg}`);
    syncLog("finance-v2", "report discovery failed — continuing with detail fetch", { msg });
  }

  const discoveredIds = discovered
    .map(reportIdOf)
    .filter((id): id is number => id != null);

  await touchAccountSyncHeartbeat(options.marketplaceAccountId);
  await heartbeatSyncRun(syncRunId);

  // Detail import (idempotent upsert)
  const detail = await options.syncService.syncFinance(requestedFrom, requestedTo);
  for (const e of detail.errors) {
    if (e.includes("column missing")) warnings.push(e);
    else errors.push(e);
  }

  await touchAccountSyncHeartbeat(options.marketplaceAccountId);
  await heartbeatSyncRun(syncRunId);

  const latestOperationDate = await fetchLatestOperationDate(options.marketplaceAccountId);
  const today = toIsoDate(new Date());
  const gapDays = latestOperationDate
    ? Math.max(0, diffUtcDays(latestOperationDate, today))
    : lookbackDays;

  const presentDates = await fetchDistinctOperationDates(
    options.marketplaceAccountId,
    requestedFrom,
    requestedTo
  );
  const expectedDays = enumerateDaysInclusive(requestedFrom, requestedTo);
  // Missing calendar days with zero finance rows are informational — WB may have quiet days.
  // Treat as missing only when gap from latest exceeds warn threshold OR late reports found.
  const missingDays = expectedDays.filter((d) => !presentDates.has(d) && d <= today);

  const dbReportIds = await fetchDistinctReportIdsInDb(
    options.marketplaceAccountId,
    requestedFrom,
    requestedTo
  );

  const detailReportIds = detail.reportIds ?? [];
  const lateReportIds: number[] = [];
  const recoveredReportIds: number[] = [];

  // List discovery uses finance-api reportId (different namespace from realizationreport_id).
  // Detect late reports by period coverage: createDate after period end and DB had no dates in range before/after sync.
  for (const item of discovered) {
    const dateFrom = String(item.dateFrom ?? "").slice(0, 10);
    const dateTo = String(item.dateTo ?? "").slice(0, 10);
    const createDt = reportCreateDate(item);
    if (!dateFrom || !dateTo || !createDt) continue;
    if (createDt <= dateTo) continue;
    const periodDays = enumerateDaysInclusive(dateFrom, Math.min(dateTo, requestedTo));
    const covered = periodDays.some((d) => presentDates.has(d));
    if (!covered && createDt <= requestedTo) {
      const id = reportIdOf(item);
      if (id != null) lateReportIds.push(id);
    }
  }

  // Detail realizationreport_ids imported this run
  for (const id of detailReportIds) {
    if (!dbReportIds.has(id)) recoveredReportIds.push(id);
  }

  const lateUnique = [...new Set(lateReportIds)];
  const recoveredUnique = [...new Set(recoveredReportIds)];

  const returnedFrom = detail.returnedFrom ?? (presentDates.size > 0 ? [...presentDates].sort()[0] : null);
  const returnedTo =
    detail.returnedTo ??
    (presentDates.size > 0 ? [...presentDates].sort().at(-1)! : latestOperationDate);

  const latestReportId =
    detailReportIds.length > 0
      ? Math.max(...detailReportIds)
      : dbReportIds.size > 0
        ? Math.max(...dbReportIds)
        : null;

  const recoveryNeeded =
    gapDays > gapWarnDays ||
    lateUnique.length > 0 ||
    (latestOperationDate != null && latestOperationDate < requestedTo && gapDays > gapWarnDays);

  let status: SyncRunStatus = "success";
  if (errors.length && detail.recordsProcessed === 0) status = "failed";
  else if (recoveryNeeded) status = "warning";
  else if (errors.length || lateUnique.length > 0) status = "partial";

  await recordFinanceSyncReports(
    syncRunId,
    options.marketplaceAccountId,
    [
      ...discovered
        .map((item) => {
          const id = reportIdOf(item);
          if (id == null) return null;
          const late = lateUnique.includes(id);
          return {
            realizationreportId: id,
            dateFrom: String(item.dateFrom ?? "").slice(0, 10) || null,
            dateTo: String(item.dateTo ?? "").slice(0, 10) || null,
            createDt: reportCreateDate(item),
            status: (late ? "late" : "discovered") as "late" | "discovered",
            detailRowsUpserted: 0,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r != null),
      ...detailReportIds.map((id) => ({
        realizationreportId: id,
        dateFrom: returnedFrom,
        dateTo: returnedTo,
        createDt: null as string | null,
        status: "imported" as const,
        detailRowsUpserted: detail.recordsUpdated,
      })),
    ]
  );

  await finishSyncRun({
    syncRunId: syncRunId ?? "",
    marketplaceAccountId: options.marketplaceAccountId,
    status,
    returnedFrom,
    returnedTo,
    reportIds: detailReportIds.length ? detailReportIds : discoveredIds,
    rowsFetched: detail.recordsProcessed,
    rowsUpserted: detail.recordsUpdated,
    rowsInserted: detail.recordsInserted,
    rowsUpdated: Math.max(0, detail.recordsUpdated - detail.recordsInserted),
    missingDays: missingDays.slice(0, 60),
    lateReportIds: lateUnique,
    recoveredReportIds: recoveredUnique,
    errors,
    warnings,
    gapDays,
    latestOperationDate,
    latestReportId,
    startedAt,
  });

  syncLog("finance-v2", "END", {
    status,
    gapDays,
    latestOperationDate,
    lateReports: lateUnique.length,
    rows: detail.recordsUpdated,
    reportIds: detailReportIds.length,
  });

  return {
    entity: "finance",
    recordsProcessed: detail.recordsProcessed,
    recordsInserted: detail.recordsInserted,
    recordsUpdated: detail.recordsUpdated,
    errors,
    warnings,
    syncedAt: new Date().toISOString(),
    status,
    syncRunId,
    lookbackDays,
    requestedFrom,
    requestedTo,
    returnedFrom,
    returnedTo,
    reportIds: detailReportIds.length ? detailReportIds : discoveredIds,
    lateReportIds: lateUnique,
    missingDays,
    gapDays,
    latestOperationDate,
    latestReportId,
    recoveryNeeded,
  };
}

export function financeStatusToAccountSyncStatus(status: SyncRunStatus): SyncStatus {
  return status;
}
