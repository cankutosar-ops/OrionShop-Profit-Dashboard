/**
 * Finance Sync Architecture V2
 *
 * Production detail path is Reports/V1 incremental (one detailed page per wake).
 * Account 2 is V1-only. Account 1 may still use Statistics V5 + list as
 * controlled legacy until its V1 token is proven.
 * List is not called inside a Reports/V1 detailed wake.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { syncLog } from "@/lib/wildberries/sync-log";
import type { WbSyncService } from "@/lib/wildberries/sync-service";
import type { WbSalesReportListItem } from "@/lib/wildberries/types";
import type { SyncRunStatus, SyncRunTrigger, SyncStatus } from "@/types/database";
import {
  createSyncRun,
  finishSyncRun,
  finalizeInterruptedSyncRun,
  heartbeatSyncRun,
  recordFinanceSyncReports,
} from "@/services/sync-run-service";
import { setActiveSyncRunId } from "@/lib/commercial-continuity/sync-execution-context";
import { isFinanceHistoricalRecoveryActive } from "@/lib/finance-recovery/coordination";
import {
  getMarketplaceAccountForSync,
  touchAccountSyncHeartbeat,
} from "@/services/marketplace-account-service";
import { isAccount2FinanceV1Only, runFinanceIncrementalSync } from "@/lib/finance-incremental";
import {
  assertFinanceV1TokenReady,
  isFinanceV1LiveRequestsEnabled,
} from "@/lib/wildberries/finance-v1";
import type { FinanceIncrementalWakeOutcome } from "@/lib/finance-incremental/types";

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

function shouldUseReportsV1Detail(accountId: string, apiKey?: string | null): boolean {
  if (isAccount2FinanceV1Only(accountId)) return true;
  if (!isFinanceV1LiveRequestsEnabled()) return false;
  if (!apiKey) return false;
  try {
    assertFinanceV1TokenReady(apiKey);
    return true;
  } catch {
    return false;
  }
}

function incrementalToV2Result(
  outcome: FinanceIncrementalWakeOutcome,
  input: {
    startedAt: string;
    lookbackDays: number;
    requestedFrom: string;
    requestedTo: string;
    syncRunId: string | null;
  }
): FinanceSyncV2Result {
  const errors = outcome.error ? [outcome.error] : [];
  let status: SyncRunStatus = "success";
  if (outcome.status === "rate_limited") status = "warning";
  else if (outcome.status === "failed") status = "failed";
  else if (outcome.status === "blocked") status = "partial";
  else if (outcome.status === "idle") status = "success";
  else if (outcome.status === "week_complete" || outcome.status === "wake_ok") {
    status = "success";
  }

  return {
    entity: "finance",
    recordsProcessed: outcome.responseRows,
    recordsInserted: 0,
    recordsUpdated: outcome.persistedRows,
    errors,
    warnings: [],
    syncedAt: new Date().toISOString(),
    status,
    syncRunId: input.syncRunId,
    lookbackDays: input.lookbackDays,
    requestedFrom: input.requestedFrom,
    requestedTo: input.requestedTo,
    returnedFrom: outcome.week?.from ?? null,
    returnedTo: outcome.week?.to ?? null,
    reportIds: [],
    lateReportIds: [],
    missingDays: [],
    gapDays: 0,
    latestOperationDate: null,
    latestReportId: null,
    recoveryNeeded: outcome.status === "rate_limited" || outcome.status === "failed",
  };
}

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

  if (isFinanceHistoricalRecoveryActive(options.marketplaceAccountId)) {
    syncLog("finance-v2", "SKIP historical recovery campaign active", {
      marketplaceAccountId: options.marketplaceAccountId,
    });
    return {
      entity: "finance",
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      errors: ["skipped_finance_recovery_active"],
      warnings: [],
      syncedAt: startedAt,
      status: "failed",
      syncRunId: null,
      lookbackDays,
      requestedFrom,
      requestedTo,
      returnedFrom: null,
      returnedTo: null,
      reportIds: [],
      lateReportIds: [],
      missingDays: [],
      gapDays: 0,
      latestOperationDate: null,
      latestReportId: null,
      recoveryNeeded: false,
    };
  }

  const syncRunId = await createSyncRun({
    marketplaceAccountId: options.marketplaceAccountId,
    requestId: options.requestId ?? null,
    trigger: options.trigger,
    entities: ["finance"],
    requestedFrom,
    requestedTo,
    financeLookbackDays: lookbackDays,
  });
  setActiveSyncRunId(syncRunId);

  try {
  let v1ApiKey: string | null = null;
  try {
    const acc = await getMarketplaceAccountForSync(options.marketplaceAccountId);
    v1ApiKey = acc.apiKey;
  } catch {
    v1ApiKey = null;
  }

  if (shouldUseReportsV1Detail(options.marketplaceAccountId, v1ApiKey)) {
    await touchAccountSyncHeartbeat(options.marketplaceAccountId);
    await heartbeatSyncRun(syncRunId);
    const outcome = await runFinanceIncrementalSync({
      accountId: options.marketplaceAccountId,
    });
    const mapped = incrementalToV2Result(outcome, {
      startedAt,
      lookbackDays,
      requestedFrom,
      requestedTo,
      syncRunId,
    });
    mapped.latestOperationDate = await fetchLatestOperationDate(
      options.marketplaceAccountId
    );
    await finishSyncRun({
      syncRunId: syncRunId ?? "",
      marketplaceAccountId: options.marketplaceAccountId,
      status: mapped.status,
      returnedFrom: mapped.returnedFrom,
      returnedTo: mapped.returnedTo,
      reportIds: [],
      rowsFetched: mapped.recordsProcessed,
      rowsUpserted: mapped.recordsUpdated,
      rowsInserted: 0,
      rowsUpdated: mapped.recordsUpdated,
      missingDays: [],
      lateReportIds: [],
      recoveredReportIds: [],
      errors: mapped.errors,
      warnings: mapped.warnings,
      gapDays: mapped.gapDays,
      latestOperationDate: mapped.latestOperationDate,
      latestReportId: null,
      startedAt,
    });
    syncLog("finance-v2", "END reports-v1-incremental", {
      status: mapped.status,
      week: outcome.week?.key ?? null,
      http: outcome.httpStatus,
      rows: outcome.persistedRows,
    });
    return mapped;
  }

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
    const periodDays = enumerateDaysInclusive(
      dateFrom,
      dateTo <= requestedTo ? dateTo : requestedTo
    );
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finalizeInterruptedSyncRun({
      syncRunId,
      marketplaceAccountId: options.marketplaceAccountId,
      reason: msg,
      startedAt,
    });
    throw err;
  }
}

export function financeStatusToAccountSyncStatus(status: SyncRunStatus): SyncStatus {
  return status;
}
