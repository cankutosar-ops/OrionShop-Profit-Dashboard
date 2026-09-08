import { AsyncLocalStorage } from "node:async_hooks";

import type { WbRateLimitSnapshot } from "@/lib/wildberries/rate-limit-retry";

/**
 * Per-request sync execution context (commercial bounded path).
 * Allows WbApiClient to honor abort + reduced 429 budget without global behavior changes.
 */
export type SyncExecutionContext = {
  abortSignal?: AbortSignal;
  wb429MaxRetries?: number;
  wb429MaxTotalWaitMs?: number;
  /**
   * When true (default for commercial/recovery contexts), honor `X-RateLimit-Retry`
   * instead of fixed backoff when the header is present.
   */
  wb429HonorServerRetry?: boolean;
  /** Last server-suggested retry delay (ms) from a 429 response — mutable during request. */
  lastRateLimitRetryAfterMs?: number | null;
  /** Latest Remaining/Limit/Reset/Retry snapshot from the last WB response. */
  lastRateLimitSnapshot?: WbRateLimitSnapshot | null;
  marketplaceAccountId?: string;
  /** Latest Finance Sync V2 run id for interrupted-run cleanup. */
  activeSyncRunId?: string | null;
  /** When true, skip recordCommercialStateFromSyncResults (orchestrator persists). */
  skipCommercialStateRecord?: boolean;
};

const storage = new AsyncLocalStorage<SyncExecutionContext>();

export function getSyncExecutionContext(): SyncExecutionContext | undefined {
  return storage.getStore();
}

export function runWithSyncExecutionContext<T>(
  ctx: SyncExecutionContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(ctx, fn);
}

export function setActiveSyncRunId(syncRunId: string | null): void {
  const store = storage.getStore();
  if (store) store.activeSyncRunId = syncRunId;
}
