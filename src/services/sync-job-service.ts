import { after } from "next/server";
import type { WbSyncEntity } from "@/lib/wildberries/api-client";
import { beginSyncTrace, endSyncTrace } from "@/lib/wildberries/sync-log";
import {
  completeSyncJob,
  failSyncJob,
  getSyncJob,
  isSyncJobRunning,
  registerSyncJob,
} from "@/lib/wildberries/sync-runtime";
import { beginSyncTimer, endSyncTimer } from "@/lib/wildberries/sync-timer";
import {
  executeDashboardSync,
  type DashboardSyncRequest,
  type DashboardSyncResponse,
} from "@/services/dashboard-sync-service";
import {
  getMarketplaceAccountSyncState,
  markAccountSyncStarted,
  releaseStaleSyncLockIfNeeded,
} from "@/services/marketplace-account-service";
import { getLatestSyncRun } from "@/services/sync-run-service";
import { scheduleDailyInventorySnapshot } from "@/services/inventory-daily-snapshot-service";
import { schedulePostSyncVerification } from "@/services/sync-verification-audit-service";

export class SyncAlreadyRunningError extends Error {
  constructor(marketplaceAccountId: string) {
    super(`Sync already running for marketplace account ${marketplaceAccountId}`);
    this.name = "SyncAlreadyRunningError";
  }
}

export async function assertSyncNotRunning(marketplaceAccountId: string): Promise<void> {
  await releaseStaleSyncLockIfNeeded(marketplaceAccountId);

  if (isSyncJobRunning(marketplaceAccountId)) {
    throw new SyncAlreadyRunningError(marketplaceAccountId);
  }
  const account = await getMarketplaceAccountSyncState(marketplaceAccountId);
  if (account?.last_sync_status === "running") {
    throw new SyncAlreadyRunningError(marketplaceAccountId);
  }
}

export type ScheduleSyncResult = {
  requestId: string;
  marketplaceAccountId: string;
  accepted: true;
  mode: "background";
};

export async function scheduleBackgroundDashboardSync(
  request: DashboardSyncRequest
): Promise<ScheduleSyncResult> {
  await assertSyncNotRunning(request.marketplaceAccountId);

  const requestId = crypto.randomUUID().slice(0, 8);
  beginSyncTrace(requestId);
  beginSyncTimer();
  registerSyncJob(requestId, request.marketplaceAccountId);
  await markAccountSyncStarted(request.marketplaceAccountId);

  after(async () => {
    try {
      const result = await executeDashboardSync({
        ...request,
        skipLifecycle: true,
      });
      const timing = endSyncTimer();
      completeSyncJob(
        request.marketplaceAccountId,
        result.lastSyncStatus,
        result.results,
        timing
      );
      schedulePostSyncVerification({
        marketplaceAccountId: request.marketplaceAccountId,
        syncStatus: result.lastSyncStatus,
        syncRequestId: requestId,
        syncResults: result.results,
        syncTiming: timing,
      });
      if (result.lastSyncStatus !== "failed") {
        scheduleDailyInventorySnapshot(request.marketplaceAccountId);
      }
      endSyncTrace(requestId, result.success);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      failSyncJob(request.marketplaceAccountId, message);
      schedulePostSyncVerification({
        marketplaceAccountId: request.marketplaceAccountId,
        syncStatus: "failed",
        syncRequestId: requestId,
        syncError: message,
      });
      endSyncTrace(requestId, false);
    }
  });

  return {
    requestId,
    marketplaceAccountId: request.marketplaceAccountId,
    accepted: true,
    mode: "background",
  };
}

export async function runBlockingDashboardSync(
  request: DashboardSyncRequest
): Promise<DashboardSyncResponse> {
  await assertSyncNotRunning(request.marketplaceAccountId);
  const requestId = crypto.randomUUID().slice(0, 8);
  beginSyncTrace(requestId);
  beginSyncTimer();
  registerSyncJob(requestId, request.marketplaceAccountId);

  try {
    const result = await executeDashboardSync(request);
    const timing = endSyncTimer();
    completeSyncJob(
      request.marketplaceAccountId,
      result.lastSyncStatus,
      result.results,
      timing
    );
    schedulePostSyncVerification({
      marketplaceAccountId: request.marketplaceAccountId,
      syncStatus: result.lastSyncStatus,
      syncRequestId: requestId,
      syncResults: result.results,
      syncTiming: timing,
    });
    if (result.lastSyncStatus !== "failed") {
      scheduleDailyInventorySnapshot(request.marketplaceAccountId);
    }
    endSyncTrace(requestId, result.success);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    failSyncJob(request.marketplaceAccountId, message);
    schedulePostSyncVerification({
      marketplaceAccountId: request.marketplaceAccountId,
      syncStatus: "failed",
      syncRequestId: requestId,
      syncError: message,
    });
    endSyncTrace(requestId, false);
    throw error;
  }
}

export function readSyncJobStatus(marketplaceAccountId: string) {
  return getSyncJob(marketplaceAccountId);
}

export type SyncStatusQuery = {
  marketplaceAccountId: string;
  status: string;
  requestId: string | null;
  results: DashboardSyncResponse["results"] | null;
  timing: DashboardSyncResponse["timing"] | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  financeHealth: {
    lookbackDays: number | null;
    gapWarnDays: number | null;
    latestOperationDate: string | null;
    latestReportId: number | null;
    gapDays: number | null;
    recoveryNeeded: boolean;
    lastSyncRunId: string | null;
    lastSyncRunStatus: string | null;
    missingDays: string[];
    lateReportIds: number[];
    rowsUpserted: number | null;
    warnings: unknown[];
  } | null;
  accountLifecycle: {
    status: string | null;
    error: string | null;
  } | null;
};

export async function getDashboardSyncStatus(
  marketplaceAccountId: string
): Promise<SyncStatusQuery> {
  await releaseStaleSyncLockIfNeeded(marketplaceAccountId);

  // Kick existing-account verification once — never auto-HEALTHY from migration alone.
  const { getAccountLifecycleState, scheduleAccountLifecycle } = await import(
    "@/services/account-lifecycle-service"
  );
  const lifecycle = await getAccountLifecycleState(marketplaceAccountId).catch(() => null);
  if (lifecycle?.sync_lifecycle_status === "ACCOUNT_VERIFICATION") {
    scheduleAccountLifecycle(marketplaceAccountId);
  }

  const job = getSyncJob(marketplaceAccountId);
  const account = await getMarketplaceAccountSyncState(marketplaceAccountId);
  const latestRun = await getLatestSyncRun(marketplaceAccountId);

  const status = job?.status ?? account?.last_sync_status ?? "idle";

  return {
    marketplaceAccountId,
    status,
    requestId: job?.requestId ?? null,
    results: job?.results ?? null,
    timing: job?.timing ?? null,
    error: job?.error ?? null,
    startedAt: job?.startedAt ?? account?.last_sync_at ?? null,
    finishedAt: job?.finishedAt ?? null,
    financeHealth: account
      ? {
          lookbackDays: account.finance_lookback_days,
          gapWarnDays: account.finance_gap_warn_days,
          latestOperationDate: account.finance_latest_operation_date,
          latestReportId: account.finance_latest_report_id,
          gapDays: account.finance_gap_days,
          recoveryNeeded: account.finance_recovery_needed,
          lastSyncRunId: account.finance_last_sync_run_id,
          lastSyncRunStatus: latestRun?.status ?? null,
          missingDays: latestRun?.missing_days ?? [],
          lateReportIds: latestRun?.late_report_ids ?? [],
          rowsUpserted: latestRun?.rows_upserted ?? null,
          warnings: latestRun?.warnings ?? [],
        }
      : null,
    accountLifecycle: account
      ? {
          status: account.sync_lifecycle_status ?? null,
          error: account.finance_backfill_error ?? null,
        }
      : null,
  };
}

export type { WbSyncEntity };
