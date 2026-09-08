/**
 * Read-only view of the Reports/V1 incremental cursor.
 *
 * Used purely for observability: the worker records `rrdId` before and after a
 * tick so a GitHub Actions log proves whether the cursor moved, and never
 * moved on a failed or rate-limited page.
 */

import { createSupabaseFinanceIncrementalStateStore } from "@/lib/finance-incremental";

export type FinanceCursorSnapshot = {
  rrdId: number | null;
  weekFrom: string | null;
  weekTo: string | null;
  weekStatus: string | null;
  blockedUntil: string | null;
};

const EMPTY: FinanceCursorSnapshot = {
  rrdId: null,
  weekFrom: null,
  weekTo: null,
  weekStatus: null,
  blockedUntil: null,
};

/**
 * Never throws: a missing table or an unreachable database must degrade
 * observability, not fail the sync tick that is otherwise healthy.
 */
export async function readFinanceCursor(
  accountId: string
): Promise<FinanceCursorSnapshot> {
  try {
    const store = createSupabaseFinanceIncrementalStateStore();
    const state = await store.read(accountId);
    return {
      rrdId: state.lastPersistedRrdId ?? null,
      weekFrom: state.activeWeekFrom ?? null,
      weekTo: state.activeWeekTo ?? null,
      weekStatus: state.weekStatus ?? null,
      blockedUntil: state.reportsServerRetryUntil ?? state.reportsNextRequestNotBefore ?? null,
    };
  } catch {
    return EMPTY;
  }
}
