import type { FinanceIncrementalSyncState } from "@/lib/finance-incremental/types";
import { FINANCE_INCREMENTAL_STALE_LOCK_MS } from "@/lib/finance-incremental/types";
import { weeklyPeriodContaining } from "@/lib/finance-incremental/week-planner";

export type FinanceIncrementalHealthCheck = {
  id: string;
  ok: boolean;
  detail: string;
};

export function evaluateFinanceIncrementalHealth(input: {
  accountId: string;
  state: FinanceIncrementalSyncState;
  nowMs?: number;
  today?: string;
  duplicateSourceKeys?: number;
  crossAccountCollisions?: number;
  latestOperationDate?: string | null;
  commercialLatestDataDate?: string | null;
}): { ok: boolean; checks: FinanceIncrementalHealthCheck[] } {
  const nowMs = input.nowMs ?? Date.now();
  const today = input.today ?? new Date(nowMs).toISOString().slice(0, 10);
  const current = weeklyPeriodContaining(today);
  const lockAgeMs =
    input.state.lockHeartbeatAt || input.state.lockStartedAt
      ? nowMs - Date.parse(input.state.lockHeartbeatAt ?? input.state.lockStartedAt ?? "")
      : null;

  const checks: FinanceIncrementalHealthCheck[] = [
    {
      id: "account_isolation",
      ok: String(input.state.marketplaceAccountId) === String(input.accountId),
      detail: `state.account=${input.state.marketplaceAccountId} requested=${input.accountId}`,
    },
    {
      id: "duplicate_source_key",
      ok: (input.duplicateSourceKeys ?? 0) === 0,
      detail: `duplicateExtraRows=${input.duplicateSourceKeys ?? 0}`,
    },
    {
      id: "cross_account_collision",
      ok: (input.crossAccountCollisions ?? 0) === 0,
      detail: `collisions=${input.crossAccountCollisions ?? 0}`,
    },
    {
      id: "stuck_lock",
      ok: !input.state.lockOwner || (lockAgeMs != null && lockAgeMs <= FINANCE_INCREMENTAL_STALE_LOCK_MS),
      detail: input.state.lockOwner
        ? `owner=${input.state.lockOwner} ageMs=${lockAgeMs}`
        : "unlocked",
    },
    {
      id: "current_week_cursor",
      ok:
        input.state.weekStatus !== "in_progress" ||
        (input.state.activeWeekFrom != null && input.state.lastPersistedRrdId >= 0),
      detail: `week=${input.state.activeWeekFrom ?? "none"} rrd=${input.state.lastPersistedRrdId} status=${input.state.weekStatus}`,
    },
    {
      id: "current_week_known",
      ok: Boolean(current.key),
      detail: `current=${current.key} completed=${Boolean(input.state.completedWeeks[current.key])}`,
    },
    {
      id: "latest_operation_date",
      ok: true,
      detail: `db=${input.latestOperationDate ?? "null"} state=${input.state.latestSuccessfulDataDate ?? "null"} commercial=${input.commercialLatestDataDate ?? "null"}`,
    },
  ];

  return { ok: checks.every((c) => c.ok), checks };
}
