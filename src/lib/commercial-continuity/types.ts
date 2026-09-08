/**
 * Commercial Data Continuity — types & constants.
 * Orchestration/freshness only — does not own Financial Engine formulas.
 */

export const COMMERCIAL_SYNC_ENTITIES = ["orders", "sales", "finance"] as const;

export type CommercialSyncEntity = (typeof COMMERCIAL_SYNC_ENTITIES)[number];

export type CommercialEntityStatus =
  | "idle"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "blocked"
  | "rate_limited"
  | "permission_denied"
  | "external_unavailable"
  | "external_delay"
  | "warning";

export type CommercialFailureClass =
  | "rate_limited"
  | "permission_denied"
  | "external_unavailable"
  | "network"
  | "timeout"
  | "partial"
  | "unknown"
  | null;

export type CommercialSyncTrigger = "scheduled" | "manual" | "recover" | "api";

/** Default interval minutes when platform settings omit a value. */
export const DEFAULT_COMMERCIAL_SYNC_INTERVAL_MINUTES = 60;

/** Max days to look back for missed-period recovery in one scheduled tick. */
export const DEFAULT_COMMERCIAL_MAX_LOOKBACK_DAYS = 14;

/** Finance lag before "external_delay" is considered critical (reuse verification threshold). */
export const FINANCE_EXTERNAL_DELAY_WARN_DAYS = 7;

/** Bounded retry policy for durable retries after in-request retries exhaust. */
export const COMMERCIAL_RETRY_POLICY = {
  maxAttempts: 8,
  /** Base delay seconds; exponential: base * 2^retryCount, capped. */
  baseDelaySeconds: 300,
  maxDelaySeconds: 6 * 60 * 60,
  /** Do not auto-retry permission failures. */
  noRetryStatuses: ["permission_denied", "blocked"] as CommercialEntityStatus[],
} as const;

export type CommercialEntitySyncStateRow = {
  marketplace_account_id: string;
  entity: CommercialSyncEntity;
  last_execution_at: string | null;
  last_successful_execution_at: string | null;
  latest_data_date: string | null;
  status: CommercialEntityStatus;
  failure_class: string | null;
  last_error: string | null;
  retry_count: number;
  next_retry_at: string | null;
  last_requested_from: string | null;
  last_requested_to: string | null;
  last_sync_run_id: string | null;
  rows_upserted_last: number;
  updated_at: string;
};

export type CommercialEntityFreshnessView = {
  entity: CommercialSyncEntity;
  lastExecutionAt: string | null;
  lastSuccessfulExecutionAt: string | null;
  latestDataDate: string | null;
  status: CommercialEntityStatus;
  failureClass: string | null;
  lastError: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  daysBehindExpected: number | null;
  freshnessLabel: "current" | "delayed" | "critical" | "blocked" | "rate_limited" | "external_delay" | "unknown";
};

export type AccountCommercialContinuityResult = {
  marketplaceAccountId: string;
  accountName: string;
  skipped: boolean;
  skipReason?: string;
  entities: Array<{
    entity: CommercialSyncEntity;
    status: CommercialEntityStatus;
    latestDataDate: string | null;
    error?: string | null;
  }>;
};

export type CommercialContinuityTickResult = {
  tickId: string | null;
  trigger: CommercialSyncTrigger;
  startedAt: string;
  finishedAt: string;
  accountsConsidered: number;
  accountsSynced: number;
  accountsSkipped: number;
  accountsFailed: number;
  results: AccountCommercialContinuityResult[];
};
