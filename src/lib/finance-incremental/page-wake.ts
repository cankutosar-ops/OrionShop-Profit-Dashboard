import { randomUUID } from "node:crypto";
import {
  ACCOUNT2_FINANCE_SELLER_ID,
  ACCOUNT2_MARKETPLACE_ACCOUNT_ID,
  FINANCE_INCREMENTAL_API_SOURCE,
  type FinanceIncrementalPageResult,
  type FinanceIncrementalSyncState,
  type FinanceIncrementalWakeOutcome,
  type FinanceIncrementalWeek,
} from "@/lib/finance-incremental/types";
import { markWeekComplete, planFinanceIncrementalWork } from "@/lib/finance-incremental/week-planner";
import {
  applyReportsPacingAfterRequest,
  isFinanceHttp429,
  reportsIncrementalBlockedUntil,
} from "@/lib/finance-incremental/rate-limit";
import {
  assertFinanceV1LiveAllowed,
  assertFinanceV1TokenReady,
} from "@/lib/wildberries/finance-v1";

export type FinanceIncrementalAccount = {
  id: string;
  sellerId: string | null;
  apiKey: string;
};

export type FinanceReportsV1PageWakeInput = {
  accountId: string;
  weekFrom: string;
  weekTo: string;
  rrdId: number;
  mode: FinanceIncrementalSyncState["mode"];
  expectedSellerId?: string | null;
  today?: string;
  nowMs?: number;
  lockOwner?: string;
  requireCurrentPlan?: boolean;
};

export type FinanceReportsV1PageWakeDeps = {
  readPublicationEvidence?: (accountId: string, week: FinanceIncrementalWeek, observedBefore: string) =>
    Promise<import("./publication").FinancePublicationEvidence | null>;
  loadAccount: (accountId: string) => Promise<FinanceIncrementalAccount>;
  readState: (accountId: string) => Promise<FinanceIncrementalSyncState>;
  acquireLease: (accountId: string, owner: string) => Promise<FinanceIncrementalSyncState | null>;
  renewLease: (accountId: string, owner: string) => Promise<boolean>;
  commitLease: (state: FinanceIncrementalSyncState, owner: string, release: boolean) => Promise<boolean>;
  syncPage: (input: {
    accountId: string;
    weekFrom: string;
    weekTo: string;
    rrdId: number;
    leaseOwner: string;
  }) => Promise<FinanceIncrementalPageResult>;
  assertLiveAllowed?: () => void;
  assertTokenReady?: (token: string) => void;
  nowMs?: () => number;
};

export function isAccount2FinanceV1Only(accountId: string): boolean {
  return String(accountId) === ACCOUNT2_MARKETPLACE_ACCOUNT_ID;
}

export function assertFinanceAccountIsolation(input: {
  accountId: string;
  sellerId: string | null | undefined;
  expectedSellerId?: string | null;
}): void {
  if (!/^[1-9]\d*$/.test(String(input.accountId))) {
    throw new Error(`Finance incremental refuses non-numeric account id=${input.accountId}`);
  }
  if (isAccount2FinanceV1Only(input.accountId)) {
    const expected = input.expectedSellerId ?? ACCOUNT2_FINANCE_SELLER_ID;
    if (String(input.sellerId ?? "") !== String(expected)) {
      throw new Error(
        `Account 2 isolation failed: seller_id expected ${expected}, got ${input.sellerId ?? "undef"}`
      );
    }
  } else if (
    input.expectedSellerId != null &&
    String(input.sellerId ?? "") !== String(input.expectedSellerId)
  ) {
    throw new Error(
      `Finance account isolation failed: seller_id expected ${input.expectedSellerId}, got ${input.sellerId ?? "undef"}`
    );
  }
}

function weekOf(from: string, to: string): FinanceIncrementalWeek {
  return { from, to, key: `${from}:${to}` };
}

/**
 * One Reports/V1 detailed page. Cursor advances only after a successful persist.
 * Never calls list or Statistics V5.
 */
export async function runFinanceReportsV1PageWake(
  input: FinanceReportsV1PageWakeInput,
  deps: FinanceReportsV1PageWakeDeps
): Promise<FinanceIncrementalWakeOutcome> {
  const nowMs = input.nowMs ?? deps.nowMs?.() ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const today = input.today ?? nowIso.slice(0, 10);
  const week = weekOf(input.weekFrom, input.weekTo);
  const lockOwner = input.lockOwner ?? randomUUID();
  const cursorBefore = Number.isSafeInteger(input.rrdId) ? input.rrdId : 0;
  let state = await deps.readState(input.accountId);
  let httpRequests = 0;

  const blockedBase = (): FinanceIncrementalWakeOutcome => ({
    accountId: input.accountId,
    status: "blocked",
    mode: state.mode,
    week,
    cursorBefore,
    cursorAfter: state.lastPersistedRrdId,
    weekStatus: state.weekStatus,
    httpStatus: null,
    responseRows: 0,
    persistedRows: 0,
    hasMore: null,
    httpRequests: 0,
    listCalls: 0,
    v5Calls: 0,
    retryPerformed: false,
    cursorAdvancedBeforePersist: false,
    reportsNextRequestNotBefore: state.reportsNextRequestNotBefore,
    reportsServerRetryUntil: state.reportsServerRetryUntil,
    remaining: null,
    limit: null,
    resetSeconds: null,
    retrySeconds: null,
    error: null,
    liveHttpAttempted: false,
  });
  const leaseLost = (): FinanceIncrementalWakeOutcome => ({
    ...blockedBase(), status: "blocked", cursorAfter: cursorBefore,
    httpRequests, liveHttpAttempted: httpRequests > 0, error: "lease_lost",
  });
  const commit = (release: boolean) => deps.commitLease(state, lockOwner, release);

  try {
    const account = await deps.loadAccount(input.accountId);
    if (String(account.id) !== String(input.accountId)) {
      throw new Error(
        `Finance incremental refused: loaded account ${account.id} != requested ${input.accountId}`
      );
    }
    assertFinanceAccountIsolation({
      accountId: input.accountId,
      sellerId: account.sellerId,
      expectedSellerId: input.expectedSellerId,
    });
    (deps.assertTokenReady ?? assertFinanceV1TokenReady)(account.apiKey);
    (deps.assertLiveAllowed ?? assertFinanceV1LiveAllowed)();
  } catch (err) {
    return {
      ...blockedBase(),
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const acquired = await deps.acquireLease(input.accountId, lockOwner);
  if (!acquired) return { ...blockedBase(), status: "lease_busy" };
  state = acquired;
  // Recheck the plan under the acquired lease: another wake may have finished
  // between the orchestrator's read and this atomic acquisition.
  if (input.requireCurrentPlan) {
    const fresh = planFinanceIncrementalWork({ state, today });
    if (!fresh.week || fresh.week.from !== input.weekFrom ||
        fresh.week.to !== input.weekTo || fresh.rrdId !== cursorBefore ||
        fresh.mode !== input.mode) {
      if (!await commit(true)) return leaseLost();
      return { ...blockedBase(), error: "stale_finance_plan" };
    }
  }
  const gateUntil = reportsIncrementalBlockedUntil(state, nowMs);
  if (gateUntil) {
    if (!await commit(true)) return leaseLost();
    return {
      ...blockedBase(),
      status: "blocked",
      error: `reports_timing_gate:${gateUntil}`,
    };
  }

  state = {
    ...state,
    marketplaceAccountId: input.accountId,
    mode: input.mode === "idle" ? "current_week" : input.mode,
    weekStatus: "in_progress",
    activeWeekFrom: input.weekFrom,
    activeWeekTo: input.weekTo,
    lastPersistedRrdId: cursorBefore,
    lockOwner,
    lastWakeAt: nowIso,
    lastCursorBefore: cursorBefore,
    updatedAt: nowIso,
  };
  if (!await commit(false)) return leaseLost();

  let page: FinanceIncrementalPageResult;
  // A slow WB request keeps the lease alive. Database batch writes and cursor
  // commits still check ownership/expiry in their own transactions.
  let renewal: Promise<boolean> | null = null;
  let renewalFailed = false;
  const timer = setInterval(() => {
    if (renewal) return;
    renewal = deps.renewLease(input.accountId, lockOwner)
      .then((ok) => { if (!ok) renewalFailed = true; return ok; })
      // A transient renewal error is uncertain; guarded batch/state writes
      // remain authoritative and will reject an actually expired lease.
      .catch(() => false)
      .finally(() => { renewal = null; });
  }, 60_000);
  timer.unref?.();
  try {
    httpRequests = 1;
    page = await deps.syncPage({
      accountId: input.accountId,
      weekFrom: input.weekFrom,
      weekTo: input.weekTo,
      rrdId: cursorBefore,
      leaseOwner: lockOwner,
    });
  } catch (err) {
    clearInterval(timer);
    if (renewal) await renewal;
    if (renewalFailed) return leaseLost();
    const message = err instanceof Error ? err.message : String(err);
    state = {
      ...state,
      lastError: message,
      updatedAt: new Date().toISOString(),
    };
    if (!await commit(true)) return leaseLost();
    return {
      ...blockedBase(),
      status: "failed",
      httpRequests: 1,
      liveHttpAttempted: true,
      error: message,
    };
  }
  clearInterval(timer);
  if (renewal) await renewal;
  if (renewalFailed) return leaseLost();

  const httpStatus = page.httpStatus;
  const rateLimited = httpStatus === 429 || isFinanceHttp429(page.errors);
  state = applyReportsPacingAfterRequest({
    state,
    nowMs,
    remaining: page.remaining,
    limit: page.limit,
    resetSeconds: page.resetSeconds,
    retrySeconds: page.retrySeconds,
    httpStatus: rateLimited ? 429 : (httpStatus ?? 0),
  });

  if (rateLimited) {
    state = {
      ...state,
      lastHttpStatus: 429,
      lastError: page.errors[0] ?? "FINANCE_HTTP_429",
      lastRowsReceived: page.apiRows,
      lastRowsPersisted: 0,
      lastHasMore: page.hasMore,
      lastCursorAfter: cursorBefore,
    };
    if (!await commit(true)) return leaseLost();
    return {
      accountId: input.accountId,
      status: "rate_limited",
      mode: state.mode,
      week,
      cursorBefore,
      cursorAfter: cursorBefore,
      weekStatus: "in_progress",
      httpStatus: 429,
      responseRows: page.apiRows,
      persistedRows: 0,
      hasMore: page.hasMore,
      httpRequests,
      listCalls: 0,
      v5Calls: 0,
      retryPerformed: false,
      cursorAdvancedBeforePersist: false,
      reportsNextRequestNotBefore: state.reportsNextRequestNotBefore,
      reportsServerRetryUntil: state.reportsServerRetryUntil,
      remaining: page.remaining,
      limit: page.limit,
      resetSeconds: page.resetSeconds,
      retrySeconds: page.retrySeconds,
      error: page.errors[0] ?? "FINANCE_HTTP_429",
      liveHttpAttempted: true,
    };
  }

  const invalidData = page.kind === "data" && (
    httpStatus !== 200 ||
    page.isEmpty ||
    page.apiRows <= 0 ||
    !page.hasMore ||
    page.nextRrdId == null ||
    !Number.isSafeInteger(page.nextRrdId) ||
    page.nextRrdId <= cursorBefore
  );
  const invalidTerminal = page.kind === "terminal" && (
    httpStatus !== 204 || page.apiRows !== 0 || page.hasMore
  );
  if (page.kind === "failure" || page.errors.length > 0 || invalidData || invalidTerminal) {
    const error = page.errors[0] ?? (invalidData
      ? "Finance V1 data page has no advancing cursor"
      : "Finance V1 page outcome invalid");
    state = {
      ...state,
      lastHttpStatus: httpStatus,
      lastError: error,
      lastRowsReceived: page.apiRows,
      lastRowsPersisted: page.persistedLines,
      lastCursorAfter: cursorBefore,
    };
    if (!await commit(true)) return leaseLost();
    return {
      accountId: input.accountId,
      status: "failed",
      mode: state.mode,
      week,
      cursorBefore,
      cursorAfter: cursorBefore,
      weekStatus: "in_progress",
      httpStatus,
      responseRows: page.apiRows,
      persistedRows: page.persistedLines,
      hasMore: page.hasMore,
      httpRequests,
      listCalls: 0,
      v5Calls: 0,
      retryPerformed: false,
      cursorAdvancedBeforePersist: false,
      reportsNextRequestNotBefore: state.reportsNextRequestNotBefore,
      reportsServerRetryUntil: state.reportsServerRetryUntil,
      remaining: page.remaining,
      limit: page.limit,
      resetSeconds: page.resetSeconds,
      retrySeconds: page.retrySeconds,
      error,
      liveHttpAttempted: true,
    };
  }

  if (page.kind === "terminal") {
    // Persist pending state using the existing in_progress + last_error columns.
    // No schema change, cursor reset, historical anchor reclassification or extra WB call.
    let publicationEvidence: import("./publication").FinancePublicationEvidence | null = null;
    let evidenceReadFailed = false;
    try { publicationEvidence = await deps.readPublicationEvidence?.(input.accountId, week, nowIso) ?? null; }
    catch { evidenceReadFailed = true; }
    const covered = publicationEvidence?.source === "wb_sales_reports_list" &&
      publicationEvidence.marketplaceAccountId === input.accountId &&
      publicationEvidence.from === week.from && publicationEvidence.through === week.to &&
      publicationEvidence.reportIds.length > 0 && publicationEvidence.observedBefore === nowIso;
    if (!covered) {
      state = { ...state, weekStatus: "in_progress", lastPersistedRrdId: cursorBefore,
        lastHttpStatus: 204, lastRowsReceived: 0, lastRowsPersisted: 0, lastHasMore: false,
        lastCursorAfter: cursorBefore, lastError: evidenceReadFailed
          ? "awaiting_publication:evidence_unavailable" : "awaiting_publication" };
      if (!await commit(true)) return leaseLost();
      return { ...blockedBase(), status: "awaiting_publication", weekStatus: "in_progress",
        cursorAfter: cursorBefore, httpStatus: 204, httpRequests, liveHttpAttempted: true,
        hasMore: false, error: state.lastError };
    }
    state = markWeekComplete({
      state: {
        ...state,
        lastHttpStatus: httpStatus,
        lastError: null,
        lastRowsReceived: page.apiRows,
        lastRowsPersisted: page.persistedLines,
        lastHasMore: false,
        lastCursorAfter: null,
        latestSuccessfulDataDate: page.returnedTo ?? state.latestSuccessfulDataDate,
      },
      week,
      today,
      nowIso: new Date().toISOString(),
    });
    state.completedWeeks[week.key] = { ...state.completedWeeks[week.key], publicationEvidence: publicationEvidence! };
    if (!await commit(true)) return leaseLost();
    return {
      accountId: input.accountId,
      status: "week_complete",
      mode: "idle",
      week,
      cursorBefore,
      cursorAfter: null,
      weekStatus: "idle",
      httpStatus,
      responseRows: page.apiRows,
      persistedRows: page.persistedLines,
      hasMore: false,
      httpRequests,
      listCalls: 0,
      v5Calls: 0,
      retryPerformed: false,
      cursorAdvancedBeforePersist: false,
      reportsNextRequestNotBefore: state.reportsNextRequestNotBefore,
      reportsServerRetryUntil: state.reportsServerRetryUntil,
      remaining: page.remaining,
      limit: page.limit,
      resetSeconds: page.resetSeconds,
      retrySeconds: page.retrySeconds,
      error: null,
      liveHttpAttempted: true,
    };
  }

  const nextCursor = page.nextRrdId as number;
  state = {
    ...state,
    weekStatus: "in_progress",
    lastPersistedRrdId: nextCursor,
    lastHttpStatus: httpStatus,
    lastError: null,
    lastRowsReceived: page.apiRows,
    lastRowsPersisted: page.persistedLines,
    lastHasMore: true,
    lastCursorAfter: nextCursor,
    latestSuccessfulDataDate: page.returnedTo ?? state.latestSuccessfulDataDate,
    updatedAt: new Date().toISOString(),
  };
  if (!await commit(true)) return leaseLost();

  return {
    accountId: input.accountId,
    status: "wake_ok",
    mode: state.mode,
    week,
    cursorBefore,
    cursorAfter: nextCursor,
    weekStatus: "in_progress",
    httpStatus,
    responseRows: page.apiRows,
    persistedRows: page.persistedLines,
    hasMore: true,
    httpRequests,
    listCalls: 0,
    v5Calls: 0,
    retryPerformed: false,
    cursorAdvancedBeforePersist: false,
    reportsNextRequestNotBefore: state.reportsNextRequestNotBefore,
    reportsServerRetryUntil: state.reportsServerRetryUntil,
    remaining: page.remaining,
    limit: page.limit,
    resetSeconds: page.resetSeconds,
    retrySeconds: page.retrySeconds,
    error: null,
    liveHttpAttempted: true,
  };
}

export const FINANCE_INCREMENTAL_SOURCE = FINANCE_INCREMENTAL_API_SOURCE;
