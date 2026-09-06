import {
  ACCOUNT2_FINANCE_SELLER_ID,
  ACCOUNT2_MARKETPLACE_ACCOUNT_ID,
  FINANCE_INCREMENTAL_API_SOURCE,
  FINANCE_INCREMENTAL_STALE_LOCK_MS,
  type FinanceIncrementalPageResult,
  type FinanceIncrementalSyncState,
  type FinanceIncrementalWakeOutcome,
  type FinanceIncrementalWeek,
} from "@/lib/finance-incremental/types";
import { markWeekComplete } from "@/lib/finance-incremental/week-planner";
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
};

export type FinanceReportsV1PageWakeDeps = {
  loadAccount: (accountId: string) => Promise<FinanceIncrementalAccount>;
  readState: (accountId: string) => Promise<FinanceIncrementalSyncState>;
  writeState: (state: FinanceIncrementalSyncState) => Promise<void>;
  syncPage: (input: {
    accountId: string;
    weekFrom: string;
    weekTo: string;
    rrdId: number;
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

function inferHttpStatus(result: FinanceIncrementalPageResult): number {
  if (result.httpStatus) return result.httpStatus;
  if (result.isEmpty) return 204;
  return 200;
}

function isLockStale(state: FinanceIncrementalSyncState, nowMs: number): boolean {
  if (!state.lockOwner) return true;
  const beat = Date.parse(state.lockHeartbeatAt ?? state.lockStartedAt ?? "");
  if (!Number.isFinite(beat)) return true;
  return nowMs - beat > FINANCE_INCREMENTAL_STALE_LOCK_MS;
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
  const lockOwner = input.lockOwner ?? `pid:${process.pid}`;
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

  const gateUntil = reportsIncrementalBlockedUntil(state, nowMs);
  if (gateUntil) {
    return {
      ...blockedBase(),
      status: "blocked",
      error: `reports_timing_gate:${gateUntil}`,
    };
  }

  if (state.lockOwner && state.lockOwner !== lockOwner && !isLockStale(state, nowMs)) {
    return {
      ...blockedBase(),
      error: `lock_held:${state.lockOwner}`,
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
    lockStartedAt: state.lockStartedAt ?? nowIso,
    lockHeartbeatAt: nowIso,
    lastWakeAt: nowIso,
    lastCursorBefore: cursorBefore,
    updatedAt: nowIso,
  };
  await deps.writeState(state);

  let page: FinanceIncrementalPageResult;
  try {
    httpRequests = 1;
    page = await deps.syncPage({
      accountId: input.accountId,
      weekFrom: input.weekFrom,
      weekTo: input.weekTo,
      rrdId: cursorBefore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state = {
      ...state,
      lastError: message,
      lockOwner: null,
      lockHeartbeatAt: null,
      updatedAt: new Date().toISOString(),
    };
    await deps.writeState(state);
    return {
      ...blockedBase(),
      status: "failed",
      httpRequests: 1,
      liveHttpAttempted: true,
      error: message,
    };
  }

  const httpStatus = inferHttpStatus(page);
  const rateLimited = httpStatus === 429 || isFinanceHttp429(page.errors);
  state = applyReportsPacingAfterRequest({
    state,
    nowMs,
    remaining: page.remaining,
    limit: page.limit,
    resetSeconds: page.resetSeconds,
    retrySeconds: page.retrySeconds,
    httpStatus: rateLimited ? 429 : httpStatus,
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
      lockOwner: null,
      lockHeartbeatAt: null,
    };
    await deps.writeState(state);
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

  if (page.errors.length > 0 && !page.isEmpty) {
    state = {
      ...state,
      lastHttpStatus: httpStatus,
      lastError: page.errors[0],
      lastRowsReceived: page.apiRows,
      lastRowsPersisted: page.persistedLines,
      lastCursorAfter: cursorBefore,
      lockOwner: null,
      lockHeartbeatAt: null,
    };
    await deps.writeState(state);
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
      error: page.errors[0],
      liveHttpAttempted: true,
    };
  }

  const terminal = page.isEmpty || httpStatus === 204 || !page.hasMore;
  if (terminal) {
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
        lockOwner: null,
        lockHeartbeatAt: null,
      },
      week,
      today,
      nowIso: new Date().toISOString(),
    });
    await deps.writeState(state);
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

  const nextCursor = page.nextRrdId ?? cursorBefore;
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
    lockOwner: null,
    lockHeartbeatAt: null,
    updatedAt: new Date().toISOString(),
  };
  await deps.writeState(state);

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
