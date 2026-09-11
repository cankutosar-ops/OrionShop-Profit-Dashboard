/**
 * Account-level sync lock for historical Finance recovery — reuses Commercial Continuity locks.
 */

import {
  FINANCE_RECOVERY_WB_429_MAX_RETRIES,
  FINANCE_RECOVERY_WB_429_MAX_TOTAL_WAIT_MS,
} from "@/lib/commercial-continuity/execution-bounds";
import {
  runWithSyncExecutionContext,
  type SyncExecutionContext,
} from "@/lib/commercial-continuity/sync-execution-context";
import {
  markAccountSyncFinished,
  markAccountSyncStarted,
  touchAccountSyncHeartbeat,
} from "@/services/marketplace-account-service";
import {
  assertSyncNotRunning,
  SyncAlreadyRunningError,
} from "@/services/sync-job-service";

export { SyncAlreadyRunningError };

export function buildFinanceRecoveryExecutionContext(
  marketplaceAccountId: string
): SyncExecutionContext {
  return {
    marketplaceAccountId,
    wb429MaxRetries: FINANCE_RECOVERY_WB_429_MAX_RETRIES,
    wb429MaxTotalWaitMs: FINANCE_RECOVERY_WB_429_MAX_TOTAL_WAIT_MS,
    wb429HonorServerRetry: true,
    lastRateLimitRetryAfterMs: null,
  };
}

export async function acquireFinanceRecoveryAccountLock(
  marketplaceAccountId: string
): Promise<void> {
  const { releaseStaleFinanceRecoveryCoordination } = await import(
    "@/lib/finance-recovery/coordination"
  );
  releaseStaleFinanceRecoveryCoordination(marketplaceAccountId);
  await assertSyncNotRunning(marketplaceAccountId);
  await markAccountSyncStarted(marketplaceAccountId);
}

export async function releaseFinanceRecoveryAccountLock(
  marketplaceAccountId: string,
  status: "success" | "partial" | "failed"
): Promise<void> {
  await markAccountSyncFinished(marketplaceAccountId, status);
}

export async function touchFinanceRecoveryAccountLock(
  marketplaceAccountId: string
): Promise<void> {
  await touchAccountSyncHeartbeat(marketplaceAccountId);
}

export async function runFinanceRecoveryBounded<T>(
  marketplaceAccountId: string,
  fn: () => Promise<T>
): Promise<T> {
  return runWithSyncExecutionContext(
    buildFinanceRecoveryExecutionContext(marketplaceAccountId),
    fn
  );
}
