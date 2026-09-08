/**
 * Finance Sync Architecture V2 — durable audit + health helpers.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FinanceSyncReportRow,
  FinanceSyncReportStatus,
  SyncRun,
  SyncRunStatus,
  SyncRunTrigger,
} from "@/types/database";

export type CreateSyncRunInput = {
  marketplaceAccountId: string;
  requestId?: string | null;
  trigger: SyncRunTrigger;
  entities: string[];
  requestedFrom?: string | null;
  requestedTo?: string | null;
  financeLookbackDays?: number | null;
};

export type FinishSyncRunInput = {
  syncRunId: string;
  marketplaceAccountId: string;
  status: SyncRunStatus;
  returnedFrom?: string | null;
  returnedTo?: string | null;
  reportIds?: number[];
  rowsFetched?: number;
  rowsUpserted?: number;
  rowsInserted?: number;
  rowsUpdated?: number;
  missingDays?: string[];
  lateReportIds?: number[];
  recoveredReportIds?: number[];
  errors?: unknown[];
  warnings?: unknown[];
  gapDays?: number | null;
  latestOperationDate?: string | null;
  latestReportId?: number | null;
  startedAt: string;
};

let syncRunsAvailable: boolean | null = null;
let financeReportsAvailable: boolean | null = null;

export async function syncRunsTableAvailable(): Promise<boolean> {
  if (syncRunsAvailable != null) return syncRunsAvailable;
  const sb = createAdminClient();
  const { error } = await sb.from("sync_runs").select("id").limit(1);
  syncRunsAvailable = !error;
  return syncRunsAvailable;
}

export async function financeSyncReportsTableAvailable(): Promise<boolean> {
  if (financeReportsAvailable != null) return financeReportsAvailable;
  const sb = createAdminClient();
  const { error } = await sb.from("finance_sync_reports").select("id").limit(1);
  financeReportsAvailable = !error;
  return financeReportsAvailable;
}

export async function createSyncRun(input: CreateSyncRunInput): Promise<string | null> {
  if (!(await syncRunsTableAvailable())) return null;
  const sb = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("sync_runs")
    .insert({
      marketplace_account_id: input.marketplaceAccountId,
      request_id: input.requestId ?? null,
      trigger: input.trigger,
      entities: input.entities,
      status: "running",
      requested_from: input.requestedFrom ?? null,
      requested_to: input.requestedTo ?? null,
      finance_lookback_days: input.financeLookbackDays ?? null,
      started_at: now,
      heartbeat_at: now,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[sync-runs] create failed:", error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}

export async function heartbeatSyncRun(syncRunId: string | null): Promise<void> {
  if (!syncRunId || !(await syncRunsTableAvailable())) return;
  const sb = createAdminClient();
  const now = new Date().toISOString();
  await sb.from("sync_runs").update({ heartbeat_at: now }).eq("id", syncRunId);
}

/**
 * Finalize a sync run that did not complete normally (timeout, abort, stale recovery).
 * Idempotent: only updates rows still in `running` status.
 */
export async function finalizeInterruptedSyncRun(input: {
  syncRunId: string | null;
  marketplaceAccountId: string;
  reason: string;
  startedAt?: string | null;
}): Promise<boolean> {
  if (!input.syncRunId || !(await syncRunsTableAvailable())) return false;
  const sb = createAdminClient();
  const finishedAt = new Date().toISOString();
  const startedAt = input.startedAt ?? finishedAt;
  const durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));

  const { data, error } = await sb
    .from("sync_runs")
    .update({
      status: "failed",
      finished_at: finishedAt,
      heartbeat_at: finishedAt,
      duration_ms: durationMs,
      errors: [{ code: "interrupted", message: input.reason.slice(0, 500) }],
    })
    .eq("id", input.syncRunId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[sync-runs] finalize interrupted failed:", error.message);
    return false;
  }
  return !!data?.id;
}

/**
 * Release stale `sync_runs` stuck in `running` (heartbeat or start older than TTL).
 * Idempotent; never marks success.
 */
export async function releaseStaleSyncRunsIfNeeded(
  marketplaceAccountId?: string,
  staleTtlMs?: number
): Promise<number> {
  if (!(await syncRunsTableAvailable())) return 0;
  const { SYNC_RUN_STALE_TTL_MS } = await import(
    "@/lib/commercial-continuity/execution-bounds"
  );
  const ttlMs = staleTtlMs ?? SYNC_RUN_STALE_TTL_MS;
  const cutoff = Date.now() - ttlMs;
  const sb = createAdminClient();

  let query = sb.from("sync_runs").select("id, marketplace_account_id, started_at, heartbeat_at").eq(
    "status",
    "running"
  );
  if (marketplaceAccountId) {
    query = query.eq("marketplace_account_id", marketplaceAccountId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return 0;

  let released = 0;
  for (const row of data) {
    const heartbeatMs = Date.parse(String(row.heartbeat_at ?? row.started_at ?? 0));
    if (!Number.isFinite(heartbeatMs) || heartbeatMs >= cutoff) continue;

    const ok = await finalizeInterruptedSyncRun({
      syncRunId: String(row.id),
      marketplaceAccountId: String(row.marketplace_account_id),
      reason: "Sync run interrupted (stale running recovered)",
      startedAt: row.started_at ? String(row.started_at) : null,
    });
    if (ok) {
      released += 1;
      const { finalizeStaleCommercialEntitiesRunning } = await import(
        "@/lib/commercial-continuity/persist-outcome"
      );
      await finalizeStaleCommercialEntitiesRunning(
        String(row.marketplace_account_id),
        "Sync run interrupted (stale running recovered)"
      ).catch(() => undefined);
    }
  }
  return released;
}

export async function finishSyncRun(input: FinishSyncRunInput): Promise<void> {
  if (!input.syncRunId || !(await syncRunsTableAvailable())) return;
  const sb = createAdminClient();
  const finishedAt = new Date().toISOString();
  const durationMs = Math.max(
    0,
    new Date(finishedAt).getTime() - new Date(input.startedAt).getTime()
  );

  const { error } = await sb
    .from("sync_runs")
    .update({
      status: input.status,
      returned_from: input.returnedFrom ?? null,
      returned_to: input.returnedTo ?? null,
      report_ids: input.reportIds ?? [],
      rows_fetched: input.rowsFetched ?? 0,
      rows_upserted: input.rowsUpserted ?? 0,
      rows_inserted: input.rowsInserted ?? 0,
      rows_updated: input.rowsUpdated ?? 0,
      missing_days: input.missingDays ?? [],
      late_report_ids: input.lateReportIds ?? [],
      recovered_report_ids: input.recoveredReportIds ?? [],
      errors: input.errors ?? [],
      warnings: input.warnings ?? [],
      finished_at: finishedAt,
      heartbeat_at: finishedAt,
      duration_ms: durationMs,
      gap_days: input.gapDays ?? null,
      latest_operation_date: input.latestOperationDate ?? null,
      latest_report_id: input.latestReportId ?? null,
    })
    .eq("id", input.syncRunId);

  if (error) console.warn("[sync-runs] finish failed:", error.message);

  const { error: accErr } = await sb
    .from("marketplace_accounts")
    .update({
      finance_last_sync_run_id: input.syncRunId,
      finance_latest_operation_date: input.latestOperationDate ?? null,
      finance_latest_report_id: input.latestReportId ?? null,
      finance_gap_days: input.gapDays ?? null,
      finance_recovery_needed: (input.gapDays ?? 0) > 0 || (input.lateReportIds?.length ?? 0) > 0,
      updated_at: finishedAt,
    })
    .eq("id", input.marketplaceAccountId);
  if (accErr) {
    console.warn("[sync-runs] account health update skipped:", accErr.message);
  }
}

export async function recordFinanceSyncReports(
  syncRunId: string | null,
  marketplaceAccountId: string,
  rows: Array<{
    realizationreportId: number;
    dateFrom?: string | null;
    dateTo?: string | null;
    createDt?: string | null;
    status: FinanceSyncReportStatus;
    detailRowsUpserted?: number;
  }>
): Promise<void> {
  if (!syncRunId || !rows.length || !(await financeSyncReportsTableAvailable())) return;
  const sb = createAdminClient();
  const payload = rows.map((r) => ({
    sync_run_id: syncRunId,
    marketplace_account_id: marketplaceAccountId,
    realizationreport_id: r.realizationreportId,
    date_from: r.dateFrom ?? null,
    date_to: r.dateTo ?? null,
    create_dt: r.createDt ?? null,
    status: r.status,
    detail_rows_upserted: r.detailRowsUpserted ?? 0,
  }));
  const { error } = await sb.from("finance_sync_reports").upsert(payload, {
    onConflict: "sync_run_id,realizationreport_id",
  });
  if (error) console.warn("[finance_sync_reports] upsert failed:", error.message);
}

export async function getLatestSyncRun(
  marketplaceAccountId: string
): Promise<SyncRun | null> {
  if (!(await syncRunsTableAvailable())) return null;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("sync_runs")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as SyncRun;
}

export async function getLatestFinanceSyncReports(
  syncRunId: string
): Promise<FinanceSyncReportRow[]> {
  if (!(await financeSyncReportsTableAvailable())) return [];
  const sb = createAdminClient();
  const { data } = await sb
    .from("finance_sync_reports")
    .select("*")
    .eq("sync_run_id", syncRunId)
    .order("realizationreport_id", { ascending: true });
  return (data ?? []) as FinanceSyncReportRow[];
}
