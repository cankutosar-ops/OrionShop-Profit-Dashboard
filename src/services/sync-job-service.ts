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

  COMMERCIAL_INTERRUPTED_ERROR,

  COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS,

  COMMERCIAL_WB_429_MAX_RETRIES,

  COMMERCIAL_WB_429_MAX_TOTAL_WAIT_MS,

} from "@/lib/commercial-continuity/execution-bounds";

import {

  getSyncExecutionContext,

  runWithSyncExecutionContext,

  type SyncExecutionContext,

} from "@/lib/commercial-continuity/sync-execution-context";

import {

  executeDashboardSync,

  type DashboardSyncRequest,

  type DashboardSyncResponse,

} from "@/services/dashboard-sync-service";

import {

  getMarketplaceAccountSyncState,

  markAccountSyncFinished,

  markAccountSyncStarted,

  releaseStaleSyncLockIfNeeded,

} from "@/services/marketplace-account-service";

import {

  finalizeInterruptedSyncRun,

  getLatestSyncRun,

  releaseStaleSyncRunsIfNeeded,

} from "@/services/sync-run-service";

import { scheduleDailyInventorySnapshot } from "@/services/inventory-daily-snapshot-service";

import { schedulePostSyncVerification } from "@/services/sync-verification-audit-service";

import { recordCommercialStateFromSyncResults } from "@/services/commercial-continuity-record";



export class SyncAlreadyRunningError extends Error {

  constructor(marketplaceAccountId: string) {

    super(`Sync already running for marketplace account ${marketplaceAccountId}`);

    this.name = "SyncAlreadyRunningError";

  }

}



export type BlockingDashboardSyncOptions = {

  /** Commercial continuity bounded path (timeout + reduced 429 budget). */

  commercialBounded?: boolean;

  timeoutMs?: number;

  /** Orchestrator persists entity outcome — skip duplicate recordCommercialStateFromSyncResults. */

  skipCommercialStateRecord?: boolean;

};



export async function assertSyncNotRunning(marketplaceAccountId: string): Promise<void> {

  await releaseStaleSyncLockIfNeeded(marketplaceAccountId);

  await releaseStaleSyncRunsIfNeeded(marketplaceAccountId);

  const { releaseStaleCommercialEntityRunningIfNeeded } = await import(
    "@/lib/commercial-continuity/persist-outcome"
  );

  await releaseStaleCommercialEntityRunningIfNeeded(marketplaceAccountId).catch(() => undefined);



  const account = await getMarketplaceAccountSyncState(marketplaceAccountId);

  if (account?.last_sync_status === "running") {

    throw new SyncAlreadyRunningError(marketplaceAccountId);

  }

  if (isSyncJobRunning(marketplaceAccountId)) {

    throw new SyncAlreadyRunningError(marketplaceAccountId);

  }

}



async function finalizeInterruptedCommercialSync(input: {

  marketplaceAccountId: string;

  message: string;

  syncRunId?: string | null;

  startedAt?: string | null;

}): Promise<void> {

  await markAccountSyncFinished(input.marketplaceAccountId, "failed").catch(() => undefined);

  const ctxRunId = getSyncExecutionContext()?.activeSyncRunId ?? null;

  await finalizeInterruptedSyncRun({

    syncRunId: input.syncRunId ?? ctxRunId,

    marketplaceAccountId: input.marketplaceAccountId,

    reason: input.message,

    startedAt: input.startedAt ?? null,

  });

}



function normalizeSyncError(error: unknown): string {

  if (error instanceof DOMException && error.name === "AbortError") {

    return COMMERCIAL_INTERRUPTED_ERROR;

  }

  if (error instanceof Error) return error.message;

  return String(error);

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

      void recordCommercialStateFromSyncResults({

        marketplaceAccountId: request.marketplaceAccountId,

        dateFrom: request.dateFrom,

        dateTo: request.dateTo,

        results: result.results,

      }).catch(() => undefined);

      if (result.lastSyncStatus !== "failed") {

        scheduleDailyInventorySnapshot(request.marketplaceAccountId);

      }

      endSyncTrace(requestId, result.success);

    } catch (error) {

      const message = normalizeSyncError(error);

      failSyncJob(request.marketplaceAccountId, message);

      await finalizeInterruptedCommercialSync({

        marketplaceAccountId: request.marketplaceAccountId,

        message,

      });

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

  request: DashboardSyncRequest,

  options?: BlockingDashboardSyncOptions

): Promise<DashboardSyncResponse> {

  await assertSyncNotRunning(request.marketplaceAccountId);

  const requestId = crypto.randomUUID().slice(0, 8);

  beginSyncTrace(requestId);

  beginSyncTimer();

  registerSyncJob(requestId, request.marketplaceAccountId);



  const commercialBounded = !!options?.commercialBounded;

  const timeoutMs =

    options?.timeoutMs ??

    (commercialBounded ? COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS : undefined);

  const abortController = commercialBounded && timeoutMs ? new AbortController() : undefined;

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;



  const execCtx: SyncExecutionContext = {

    abortSignal: abortController?.signal,

    wb429MaxRetries: commercialBounded ? COMMERCIAL_WB_429_MAX_RETRIES : undefined,

    wb429MaxTotalWaitMs: commercialBounded ? COMMERCIAL_WB_429_MAX_TOTAL_WAIT_MS : undefined,

    wb429HonorServerRetry: commercialBounded ? true : undefined,

    marketplaceAccountId: request.marketplaceAccountId,

    skipCommercialStateRecord: options?.skipCommercialStateRecord,

  };



  if (abortController && timeoutMs) {

    timeoutHandle = setTimeout(() => {

      abortController.abort(new DOMException(COMMERCIAL_INTERRUPTED_ERROR, "AbortError"));

    }, timeoutMs);

  }



  try {

    const result = await runWithSyncExecutionContext(execCtx, () =>

      executeDashboardSync(request)

    );

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

      commercialBounded,

    });

    if (!execCtx.skipCommercialStateRecord) {

      void recordCommercialStateFromSyncResults({

        marketplaceAccountId: request.marketplaceAccountId,

        dateFrom: request.dateFrom,

        dateTo: request.dateTo,

        results: result.results,

      }).catch(() => undefined);

    }

    if (result.lastSyncStatus !== "failed") {

      scheduleDailyInventorySnapshot(request.marketplaceAccountId);

    }

    endSyncTrace(requestId, result.success);

    return result;

  } catch (error) {

    const message = normalizeSyncError(error);

    failSyncJob(request.marketplaceAccountId, message);

    await finalizeInterruptedCommercialSync({

      marketplaceAccountId: request.marketplaceAccountId,

      message,

    });

    schedulePostSyncVerification({

      marketplaceAccountId: request.marketplaceAccountId,

      syncStatus: "failed",

      syncRequestId: requestId,

      syncError: message,

      commercialBounded,

    });

    endSyncTrace(requestId, false);

    throw error instanceof Error ? error : new Error(message);

  } finally {

    if (timeoutHandle) clearTimeout(timeoutHandle);

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

  await releaseStaleSyncRunsIfNeeded(marketplaceAccountId);



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



  const status = account?.last_sync_status ?? job?.status ?? "idle";



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


