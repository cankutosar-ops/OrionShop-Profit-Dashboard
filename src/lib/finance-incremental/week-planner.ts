import {
  nextWeeklyReportsPeriod,
  reportsWeekKey,
} from "@/lib/finance-recovery/reports-ingestion";
import {
  FINANCE_INCREMENTAL_OVERLAP_WEEKS,
  type FinanceIncrementalSyncState,
  type FinanceIncrementalWeek,
  type FinanceIncrementalWork,
} from "@/lib/finance-incremental/types";

export function addIsoDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC Monday of the ISO week containing `isoDate` (Mon–Sun weeks). */
export function utcMondayOf(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Calendar Mon–Sun helper retained for diagnostics/health only.
 * Incremental catch-up planning must use {@link nextWeeklyReportsPeriod} chains.
 */
export function weeklyPeriodContaining(isoDate: string): FinanceIncrementalWeek {
  const from = utcMondayOf(isoDate);
  const to = addIsoDays(from, 6);
  return { from, to, key: reportsWeekKey(from, to) };
}

export function previousWeeklyPeriod(
  week: FinanceIncrementalWeek
): FinanceIncrementalWeek {
  const to = addIsoDays(week.from, -1);
  const from = addIsoDays(to, -6);
  return { from, to, key: reportsWeekKey(from, to) };
}

/**
 * Latest completed Reports period by `to` (then `from`) — sequential chain anchor.
 * Does not use MAX(operation_date) or wall-clock weeks.
 */
export function latestCompletedReportsWeek(
  completedWeeks: FinanceIncrementalSyncState["completedWeeks"]
): FinanceIncrementalWeek | null {
  let best: FinanceIncrementalWeek | null = null;
  for (const entry of Object.values(completedWeeks ?? {})) {
    if (!entry?.from || !entry?.to) continue;
    const from = String(entry.from).slice(0, 10);
    const to = String(entry.to).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      continue;
    }
    const week: FinanceIncrementalWeek = {
      from,
      to,
      key: reportsWeekKey(from, to),
    };
    if (
      !best ||
      week.to > best.to ||
      (week.to === best.to && week.from > best.from)
    ) {
      best = week;
    }
  }
  return best;
}

/** Next sequential Reports period after a completed week (rrdId always 0 for a new week). */
export function nextSequentialCatchupPeriod(
  completed: FinanceIncrementalWeek
): FinanceIncrementalWeek {
  const next = nextWeeklyReportsPeriod({
    periodFrom: completed.from,
    periodTo: completed.to,
  });
  return { from: next.from, to: next.to, key: next.key };
}

/**
 * Previous N sequential periods before `anchor` (same 7-day chain as recovery).
 * Used for overlap revalidation — not Mon–Sun calendar jumps.
 */
export function lastCompletedWeeklyPeriods(
  anchorWeek: FinanceIncrementalWeek,
  count = FINANCE_INCREMENTAL_OVERLAP_WEEKS
): FinanceIncrementalWeek[] {
  const out: FinanceIncrementalWeek[] = [];
  let cursor = anchorWeek;
  for (let i = 0; i < count; i += 1) {
    cursor = previousWeeklyPeriod(cursor);
    out.push(cursor);
  }
  return out;
}

export function emptyFinanceIncrementalState(
  marketplaceAccountId: string,
  nowIso = new Date().toISOString()
): FinanceIncrementalSyncState {
  return {
    marketplaceAccountId,
    mode: "idle",
    weekStatus: "idle",
    activeWeekFrom: null,
    activeWeekTo: null,
    lastPersistedRrdId: 0,
    overlapRevalidateQueue: [],
    completedWeeks: {},
    reportsLastRequestAt: null,
    reportsNextRequestNotBefore: null,
    reportsServerRetryUntil: null,
    reportsLastRateLimitSnapshot: null,
    lockOwner: null,
    lockHeartbeatAt: null,
    lockStartedAt: null,
    latestSuccessfulDataDate: null,
    lastHttpStatus: null,
    lastWakeAt: null,
    lastError: null,
    lastCursorBefore: null,
    lastCursorAfter: null,
    lastRowsReceived: null,
    lastRowsPersisted: null,
    lastHasMore: null,
    updatedAt: nowIso,
  };
}

/**
 * Deterministic sequential Reports/V1 catch-up planner.
 * Does not skip incomplete periods. Does not use MAX(operation_date).
 * Priority: unfinished active week → next sequential period after latest
 * completed week (if next.from <= today) → overlap queue → idle.
 */
export function planFinanceIncrementalWork(input: {
  state: FinanceIncrementalSyncState;
  today: string;
}): FinanceIncrementalWork {
  const today = String(input.today).slice(0, 10);
  const activeFrom = input.state.activeWeekFrom;
  const activeTo = input.state.activeWeekTo;

  if (
    input.state.weekStatus === "in_progress" &&
    activeFrom &&
    activeTo
  ) {
    return {
      kind: "continue_active",
      mode: input.state.mode === "idle" ? "current_week" : input.state.mode,
      week: {
        from: activeFrom,
        to: activeTo,
        key: reportsWeekKey(activeFrom, activeTo),
      },
      rrdId: Number.isSafeInteger(input.state.lastPersistedRrdId)
        ? input.state.lastPersistedRrdId
        : 0,
      reason: "resume_incomplete_active_week",
    };
  }

  const latest = latestCompletedReportsWeek(input.state.completedWeeks);
  if (latest) {
    const next = nextSequentialCatchupPeriod(latest);
    if (next.from <= today) {
      return {
        kind: "start_catchup",
        mode: "current_week",
        week: next,
        rrdId: 0,
        reason: "sequential_catchup_next_period",
      };
    }
  } else {
    return {
      kind: "idle",
      mode: "idle",
      week: null,
      rrdId: 0,
      reason: "awaiting_completed_weeks_anchor",
    };
  }

  const queue = input.state.overlapRevalidateQueue ?? [];
  if (queue.length > 0) {
    const week = queue[0];
    return {
      kind: "start_overlap",
      mode: "overlap_revalidation",
      week,
      rrdId: 0,
      reason: "overlap_revalidation_queue",
    };
  }

  return {
    kind: "idle",
    mode: "idle",
    week: nextSequentialCatchupPeriod(latest),
    rrdId: 0,
    reason: "catchup_complete_next_period_in_future",
  };
}

/**
 * Rebuild overlap from the sequential Reports chain anchored at the latest
 * completed week (not the UTC Mon–Sun week containing `today`).
 */
export function rebuildOverlapQueue(
  state: FinanceIncrementalSyncState,
  _today: string
): FinanceIncrementalWeek[] {
  const latest = latestCompletedReportsWeek(state.completedWeeks);
  if (!latest) return [];
  return lastCompletedWeeklyPeriods(latest, FINANCE_INCREMENTAL_OVERLAP_WEEKS);
}

export function markWeekComplete(input: {
  state: FinanceIncrementalSyncState;
  week: FinanceIncrementalWeek;
  today: string;
  nowIso: string;
}): FinanceIncrementalSyncState {
  const completedWeeks = {
    ...input.state.completedWeeks,
    [input.week.key]: {
      from: input.week.from,
      to: input.week.to,
      completedAt: input.nowIso,
      lastRevalidatedAt:
        input.state.mode === "overlap_revalidation" ? input.nowIso : null,
    },
  };
  const remainingQueue = (input.state.overlapRevalidateQueue ?? []).filter(
    (w) => w.key !== input.week.key
  );
  const overlapRevalidateQueue =
    input.state.mode === "current_week"
      ? rebuildOverlapQueue({ ...input.state, completedWeeks }, input.today)
      : remainingQueue;

  return {
    ...input.state,
    mode: "idle",
    weekStatus: "idle",
    activeWeekFrom: null,
    activeWeekTo: null,
    lastPersistedRrdId: 0,
    completedWeeks,
    overlapRevalidateQueue,
    updatedAt: input.nowIso,
  };
}
