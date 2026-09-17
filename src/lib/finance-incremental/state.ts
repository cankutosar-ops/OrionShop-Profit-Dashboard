import { createAdminClient } from "@/lib/supabase/admin";
import { emptyFinanceIncrementalState } from "@/lib/finance-incremental/week-planner";
import { FINANCE_INCREMENTAL_STALE_LOCK_MS } from "@/lib/finance-incremental/types";
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
  /** Atomic DB lease acquisition; null means LEASE_BUSY. */
  acquireLease(accountId: string, owner: string): Promise<FinanceIncrementalSyncState | null>;
  renewLease(accountId: string, owner: string): Promise<boolean>;
  /** Atomically checks owner and expiry before writing state/releasing lease. */
  commitLease(state: FinanceIncrementalSyncState, owner: string, release: boolean): Promise<boolean>;
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
  lock_expires_at: string | null;
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
    lockExpiresAt: row.lock_expires_at,
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
    lock_expires_at: state.lockExpiresAt,
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
  seed: Record<string, FinanceIncrementalSyncState> = {},
  nowMs: () => number = Date.now
): FinanceIncrementalStateStore & {
  write(state: FinanceIncrementalSyncState): Promise<void>;
  dump(): Record<string, FinanceIncrementalSyncState>;
} {
  const map = new Map<string, FinanceIncrementalSyncState>(
    Object.entries(seed).map(([k, v]) => [k, structuredClone(v)])
  );
  return {
    async read(accountId: string) {
      return structuredClone(map.get(accountId) ?? emptyFinanceIncrementalState(accountId));
    },
    async acquireLease(accountId: string, owner: string) {
      const state = map.get(accountId) ?? emptyFinanceIncrementalState(accountId);
      const expiry = Date.parse(state.lockExpiresAt ?? "");
      const legacyExpiry = Date.parse(state.lockHeartbeatAt ?? state.lockStartedAt ?? "") +
        FINANCE_INCREMENTAL_STALE_LOCK_MS;
      if (state.lockOwner && (Number.isFinite(expiry) ? expiry : legacyExpiry) > nowMs()) {
        return null;
      }
      const now = new Date(nowMs()).toISOString();
      const acquired = {
        ...state, lockOwner: owner, lockStartedAt: now, lockHeartbeatAt: now,
        lockExpiresAt: new Date(nowMs() + FINANCE_INCREMENTAL_STALE_LOCK_MS).toISOString(),
        updatedAt: now,
      };
      map.set(accountId, structuredClone(acquired));
      return structuredClone(acquired);
    },
    async renewLease(accountId: string, owner: string) {
      const state = map.get(accountId);
      if (!state || state.lockOwner !== owner || Date.parse(state.lockExpiresAt ?? "") <= nowMs()) return false;
      state.lockHeartbeatAt = new Date(nowMs()).toISOString();
      state.lockExpiresAt = new Date(nowMs() + FINANCE_INCREMENTAL_STALE_LOCK_MS).toISOString();
      return true;
    },
    async commitLease(state: FinanceIncrementalSyncState, owner: string, release: boolean) {
      const current = map.get(state.marketplaceAccountId);
      if (!current || current.lockOwner !== owner || Date.parse(current.lockExpiresAt ?? "") <= nowMs()) return false;
      map.set(state.marketplaceAccountId, structuredClone({
        ...state,
        lockOwner: release ? null : owner,
        lockStartedAt: release ? null : current.lockStartedAt,
        lockHeartbeatAt: release ? null : current.lockHeartbeatAt,
        lockExpiresAt: release ? null : current.lockExpiresAt,
      }));
      return true;
    },
    /** Offline fixture setup only. Production state writes use commitLease. */
    async write(state: FinanceIncrementalSyncState) {
      map.set(state.marketplaceAccountId, structuredClone(state));
    },
    dump() {
      return Object.fromEntries([...map.entries()].map(([id, state]) => [id, structuredClone(state)]));
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
    async acquireLease(accountId: string, owner: string) {
      const { data, error } = await createAdminClient().rpc(
        "orion_finance_incremental_acquire_lease" as never,
        { p_account_id: accountId, p_owner: owner } as never
      );
      if (error) throw new Error(`finance lease acquisition failed: ${error.message}`);
      return data ? rowToState(data as unknown as StateRow) : null;
    },
    async renewLease(accountId: string, owner: string) {
      const { data, error } = await createAdminClient().rpc(
        "orion_finance_incremental_renew_lease" as never,
        { p_account_id: accountId, p_owner: owner } as never
      );
      if (error) throw new Error(`finance lease renewal failed: ${error.message}`);
      return data === true;
    },
    async commitLease(state: FinanceIncrementalSyncState, owner: string, release: boolean) {
      const { data, error } = await createAdminClient().rpc(
        "orion_finance_incremental_commit_lease" as never,
        {
          p_account_id: state.marketplaceAccountId, p_owner: owner,
          p_state: stateToRow(state), p_release: release,
        } as never
      );
      if (error) throw new Error(`finance lease state commit failed: ${error.message}`);
      return data === true;
    },
  };
}
