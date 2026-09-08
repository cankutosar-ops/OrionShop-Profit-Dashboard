/**
 * Commercial Continuity execution bounds — derived from deployment runtime limits.
 * Must stay below route maxDuration (see commercial-continuity route).
 */

/** Matches `export const maxDuration` on `/api/sync/commercial-continuity`. */
export const VERCEL_COMMERCIAL_MAX_DURATION_SEC = 300;

/** Safety buffer before the platform hard-kills the isolate. */
export const COMMERCIAL_EXECUTION_BUFFER_MS = 30_000;

/** Full blocking sync budget for one commercial entity attempt. */
export const COMMERCIAL_SYNC_EXECUTION_TIMEOUT_MS =
  VERCEL_COMMERCIAL_MAX_DURATION_SEC * 1000 - COMMERCIAL_EXECUTION_BUFFER_MS;

/** In-request 429 retries for commercial/scheduled Finance (fail fast → durable next_retry_at). */
export const COMMERCIAL_WB_429_MAX_RETRIES = 4;

/** Max cumulative sleep waiting on 429 within one commercial HTTP request (~90s). */
export const COMMERCIAL_WB_429_MAX_TOTAL_WAIT_MS = 90_000;

/**
 * Historical finance recovery — first 429 fails closed (no inline retry).
 * With maxRetries=1, attempt starts at 1 so `attempt < 1` never retries.
 */
export const FINANCE_RECOVERY_WB_429_MAX_RETRIES = 1;

/** No cumulative 429 sleep budget in recovery (fail closed immediately). */
export const FINANCE_RECOVERY_WB_429_MAX_TOTAL_WAIT_MS = 0;

/** Max Finance pages fetched in one recovery process wake (default: one). */
export const FINANCE_RECOVERY_MAX_PAGES_PER_WAKE = 1;

/** Post-sync verification Statistics API probe budget. */
export const VERIFICATION_WB_429_MAX_RETRIES = 2;

/** Max cumulative 429 wait for verification probes (~30s). */
export const VERIFICATION_WB_429_MAX_TOTAL_WAIT_MS = 30_000;

/** Stale finance recovery lock when progress file shows running but process is gone. */
export const FINANCE_RECOVERY_STALE_LOCK_MS = 2 * 60 * 60 * 1000;

/** Stale `sync_runs.status=running` TTL — aligned with account sync lock TTL. */
export const SYNC_RUN_STALE_TTL_MS = 10 * 60 * 1000;

export const COMMERCIAL_INTERRUPTED_ERROR =
  "Commercial sync interrupted (execution timeout or stale recovery)";

export const SYNC_RUN_STALE_RECOVERED_ERROR =
  "Sync run interrupted (stale running recovered)";
