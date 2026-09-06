export const ACCOUNT2_FINANCE_SELLER_ID = "68674";
export const ACCOUNT2_MARKETPLACE_ACCOUNT_ID = "2";
export const FINANCE_INCREMENTAL_API_SOURCE =
  "finance_v1_sales_reports_detailed" as const;
export const FINANCE_INCREMENTAL_OVERLAP_WEEKS = 2;
export const FINANCE_INCREMENTAL_STALE_LOCK_MS = 2 * 60 * 60 * 1000;

export type FinanceIncrementalMode =
  | "idle"
  | "current_week"
  | "overlap_revalidation";

export type FinanceIncrementalWeekStatus = "idle" | "in_progress" | "complete";

export type FinanceIncrementalWeek = {
  from: string;
  to: string;
  key: string;
};

export type FinanceIncrementalCompletedWeek = {
  from: string;
  to: string;
  completedAt: string;
  lastRevalidatedAt?: string | null;
};

export type FinanceReportsRateLimitSnapshot = {
  remaining: number | null;
  limit: number | null;
  resetSeconds: number | null;
  retrySeconds: number | null;
  capturedAt: string;
};

export type FinanceIncrementalSyncState = {
  marketplaceAccountId: string;
  mode: FinanceIncrementalMode;
  weekStatus: FinanceIncrementalWeekStatus;
  activeWeekFrom: string | null;
  activeWeekTo: string | null;
  lastPersistedRrdId: number;
  overlapRevalidateQueue: FinanceIncrementalWeek[];
  completedWeeks: Record<string, FinanceIncrementalCompletedWeek>;
  reportsLastRequestAt: string | null;
  reportsNextRequestNotBefore: string | null;
  reportsServerRetryUntil: string | null;
  reportsLastRateLimitSnapshot: FinanceReportsRateLimitSnapshot | null;
  lockOwner: string | null;
  lockHeartbeatAt: string | null;
  lockStartedAt: string | null;
  latestSuccessfulDataDate: string | null;
  lastHttpStatus: number | null;
  lastWakeAt: string | null;
  lastError: string | null;
  lastCursorBefore: number | null;
  lastCursorAfter: number | null;
  lastRowsReceived: number | null;
  lastRowsPersisted: number | null;
  lastHasMore: boolean | null;
  updatedAt: string;
};

export type FinanceIncrementalWorkKind =
  | "continue_active"
  | "start_current_week"
  | "start_catchup"
  | "start_overlap"
  | "idle";

export type FinanceIncrementalWork = {
  kind: FinanceIncrementalWorkKind;
  mode: FinanceIncrementalMode;
  week: FinanceIncrementalWeek | null;
  rrdId: number;
  reason: string;
};

export type FinanceIncrementalPageResult = {
  httpStatus: number;
  apiRows: number;
  persistedLines: number;
  hasMore: boolean;
  isEmpty: boolean;
  nextRrdId: number | null;
  reportIds: number[];
  returnedFrom: string | null;
  returnedTo: string | null;
  errors: string[];
  remaining: number | null;
  limit: number | null;
  resetSeconds: number | null;
  retrySeconds: number | null;
};

export type FinanceIncrementalWakeOutcome = {
  accountId: string;
  status:
    | "wake_ok"
    | "week_complete"
    | "blocked"
    | "rate_limited"
    | "failed"
    | "idle";
  mode: FinanceIncrementalMode;
  week: FinanceIncrementalWeek | null;
  cursorBefore: number;
  cursorAfter: number | null;
  weekStatus: FinanceIncrementalWeekStatus;
  httpStatus: number | null;
  responseRows: number;
  persistedRows: number;
  hasMore: boolean | null;
  httpRequests: number;
  listCalls: number;
  v5Calls: number;
  retryPerformed: boolean;
  cursorAdvancedBeforePersist: boolean;
  reportsNextRequestNotBefore: string | null;
  reportsServerRetryUntil: string | null;
  remaining: number | null;
  limit: number | null;
  resetSeconds: number | null;
  retrySeconds: number | null;
  error: string | null;
  liveHttpAttempted: boolean;
};

/** Supabase row shape for finance_incremental_sync_state (additive table). */
export type FinanceIncrementalSyncStateRow = {
  marketplace_account_id: string;
  mode: FinanceIncrementalMode;
  week_status: FinanceIncrementalWeekStatus;
  active_week_from: string | null;
  active_week_to: string | null;
  last_persisted_rrd_id: number;
  overlap_revalidate_queue: unknown;
  completed_weeks: unknown;
  reports_last_request_at: string | null;
  reports_next_request_not_before: string | null;
  reports_server_retry_until: string | null;
  reports_last_rate_limit_snapshot: unknown;
  lock_owner: string | null;
  lock_heartbeat_at: string | null;
  lock_started_at: string | null;
  latest_successful_data_date: string | null;
  last_http_status: number | null;
  last_wake_at: string | null;
  last_error: string | null;
  last_cursor_before: number | null;
  last_cursor_after: number | null;
  last_rows_received: number | null;
  last_rows_persisted: number | null;
  last_has_more: boolean | null;
  updated_at: string;
};
