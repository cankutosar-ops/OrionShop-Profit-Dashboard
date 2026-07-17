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
} from "@/services/marketplace-account-service";

export class SyncAlreadyRunningError extends Error {
  constructor(marketplaceAccountId: string) {
    super(`Sync already running for marketplace account ${marketplaceAccountId}`);
    this.name = "SyncAlreadyRunningError";
  }
}

export async function assertSyncNotRunning(marketplaceAccountId: string): Promise<void> {
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
      endSyncTrace(requestId, result.success);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      failSyncJob(request.marketplaceAccountId, message);
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
    endSyncTrace(requestId, result.success);
    return result;
  } catch (error) {
    failSyncJob(
      request.marketplaceAccountId,
      error instanceof Error ? error.message : "Sync failed"
    );
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
};

export async function getDashboardSyncStatus(
  marketplaceAccountId: string
): Promise<SyncStatusQuery> {
  const job = getSyncJob(marketplaceAccountId);
  const account = await getMarketplaceAccountSyncState(marketplaceAccountId);

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
  };
}

export type { WbSyncEntity };
