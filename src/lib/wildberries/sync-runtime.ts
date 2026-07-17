import type { WbSyncResult } from "@/lib/wildberries/api-client";
import type { SyncTimingReport } from "@/lib/wildberries/sync-timer";
import type { SyncStatus } from "@/types/database";

export type SyncJobSnapshot = {
  requestId: string;
  marketplaceAccountId: string;
  status: SyncStatus | "running";
  results: WbSyncResult[] | null;
  timing: SyncTimingReport | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const jobsByAccount = new Map<string, SyncJobSnapshot>();

export function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export function registerSyncJob(
  requestId: string,
  marketplaceAccountId: string
): SyncJobSnapshot {
  const job: SyncJobSnapshot = {
    requestId,
    marketplaceAccountId,
    status: "running",
    results: null,
    timing: null,
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };
  jobsByAccount.set(marketplaceAccountId, job);
  return job;
}

export function completeSyncJob(
  marketplaceAccountId: string,
  status: SyncStatus,
  results: WbSyncResult[],
  timing: SyncTimingReport | null
): void {
  const job = jobsByAccount.get(marketplaceAccountId);
  if (!job) return;
  job.status = status;
  job.results = results;
  job.timing = timing;
  job.finishedAt = new Date().toISOString();
}

export function failSyncJob(marketplaceAccountId: string, error: string): void {
  const job = jobsByAccount.get(marketplaceAccountId);
  if (!job) return;
  job.status = "failed";
  job.error = error;
  job.finishedAt = new Date().toISOString();
}

export function getSyncJob(marketplaceAccountId: string): SyncJobSnapshot | null {
  return jobsByAccount.get(marketplaceAccountId) ?? null;
}

export function isSyncJobRunning(marketplaceAccountId: string): boolean {
  return jobsByAccount.get(marketplaceAccountId)?.status === "running";
}
