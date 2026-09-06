import { createAdminClient } from "@/lib/supabase/admin";
import { emptyFinanceIncrementalState } from "@/lib/finance-incremental/week-planner";
import type {
  FinanceIncrementalMode,
  FinanceIncrementalSyncState,
  FinanceIncrementalWeek,
  FinanceIncrementalWeekStatus,
  FinanceIncrementalSyncStateRow,
  FinanceReportsRateLimitSnapshot,
} from "@/lib/finance-incremental/types";

export type FinanceIncrementalStateStore = {
  read(accountId: string): Promise<FinanceIncrementalSyncState>;
  write(state: FinanceIncrementalSyncState): Promise<void>;
};

type StateRow = {
  marketplace_account_id: string | number;
  mode: FinanceIncrementalMode;
  week_status: FinanceIncrementalWeekStatus;
  active_week_from: string | null;
  active_week_to: string | null;
  last_persisted_rrd_id: number | string | null;
  overlap_revalidate_queue: FinanceIncrementalWeek[] | null;
  completed_weeks: FinanceIncrementalSyncState["completedWeeks"] | null;
  reports_last_request_at: string | null;
  reports_next_request_not_before: string | null;
  reports_server_retry_until: string | null;
  reports_last_rate_limit_snapshot: FinanceReportsRateLimitSnapshot | null;
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

function rowToState(row: StateRow): FinanceIncrementalSyncState {
  return {
    marketplaceAccountId: String(row.marketplace_account_id),
    mode: row.mode,
    weekStatus: row.week_status,
    activeWeekFrom: row.active_week_from ? String(row.active_week_from).slice(0, 10) : null,
    activeWeekTo: row.active_week_to ? String(row.active_week_to).slice(0, 10) : null,
    lastPersistedRrdId: Number(row.last_persisted_rrd_id ?? 0),
    overlapRevalidateQueue: Array.isArray(row.overlap_revalidate_queue)
      ? row.overlap_revalidate_queue
      : [],
    completedWeeks: row.completed_weeks ?? {},
    reportsLastRequestAt: row.reports_last_request_at,
    reportsNextRequestNotBefore: row.reports_next_request_not_before,
    reportsServerRetryUntil: row.reports_server_retry_until,
    reportsLastRateLimitSnapshot: row.reports_last_rate_limit_snapshot,
    lockOwner: row.lock_owner,
    lockHeartbeatAt: row.lock_heartbeat_at,
    lockStartedAt: row.lock_started_at,
    latestSuccessfulDataDate: row.latest_successful_data_date
      ? String(row.latest_successful_data_date).slice(0, 10)
      : null,
    lastHttpStatus: row.last_http_status,
    lastWakeAt: row.last_wake_at,
    lastError: row.last_error,
    lastCursorBefore: row.last_cursor_before,
    lastCursorAfter: row.last_cursor_after,
    lastRowsReceived: row.last_rows_received,
    lastRowsPersisted: row.last_rows_persisted,
    lastHasMore: row.last_has_more,
    updatedAt: row.updated_at,
  };
}

function stateToRow(
  state: FinanceIncrementalSyncState
): FinanceIncrementalSyncStateRow {
  return {
    marketplace_account_id: state.marketplaceAccountId,
    mode: state.mode,
    week_status: state.weekStatus,
    active_week_from: state.activeWeekFrom,
    active_week_to: state.activeWeekTo,
    last_persisted_rrd_id: state.lastPersistedRrdId,
    overlap_revalidate_queue: state.overlapRevalidateQueue,
    completed_weeks: state.completedWeeks,
    reports_last_request_at: state.reportsLastRequestAt,
    reports_next_request_not_before: state.reportsNextRequestNotBefore,
    reports_server_retry_until: state.reportsServerRetryUntil,
    reports_last_rate_limit_snapshot: state.reportsLastRateLimitSnapshot,
    lock_owner: state.lockOwner,
    lock_heartbeat_at: state.lockHeartbeatAt,
    lock_started_at: state.lockStartedAt,
    latest_successful_data_date: state.latestSuccessfulDataDate,
    last_http_status: state.lastHttpStatus,
    last_wake_at: state.lastWakeAt,
    last_error: state.lastError,
    last_cursor_before: state.lastCursorBefore,
    last_cursor_after: state.lastCursorAfter,
    last_rows_received: state.lastRowsReceived,
    last_rows_persisted: state.lastRowsPersisted,
    last_has_more: state.lastHasMore,
    updated_at: state.updatedAt,
  };
}

export function createMemoryFinanceIncrementalStateStore(
  seed: Record<string, FinanceIncrementalSyncState> = {}
): FinanceIncrementalStateStore & { dump(): Record<string, FinanceIncrementalSyncState> } {
  const map = new Map<string, FinanceIncrementalSyncState>(
    Object.entries(seed).map(([k, v]) => [k, { ...v }])
  );
  return {
    async read(accountId: string) {
      return map.get(accountId) ?? emptyFinanceIncrementalState(accountId);
    },
    async write(state: FinanceIncrementalSyncState) {
      map.set(state.marketplaceAccountId, { ...state });
    },
    dump() {
      return Object.fromEntries(map.entries());
    },
  };
}

export function createSupabaseFinanceIncrementalStateStore(): FinanceIncrementalStateStore {
  return {
    async read(accountId: string) {
      const sb = createAdminClient();
      const { data, error } = await sb
        .from("finance_incremental_sync_state")
        .select("*")
        .eq("marketplace_account_id", accountId)
        .maybeSingle();
      if (error) {
        throw new Error(
          `finance_incremental_sync_state read failed: ${error.message}`
        );
      }
      if (!data) return emptyFinanceIncrementalState(accountId);
      return rowToState(data as unknown as StateRow);
    },
    async write(state: FinanceIncrementalSyncState) {
      const sb = createAdminClient();
      const { error } = await sb
        .from("finance_incremental_sync_state")
        .upsert(stateToRow(state), { onConflict: "marketplace_account_id" });
      if (error) {
        throw new Error(
          `finance_incremental_sync_state write failed: ${error.message}`
        );
      }
    },
  };
}
