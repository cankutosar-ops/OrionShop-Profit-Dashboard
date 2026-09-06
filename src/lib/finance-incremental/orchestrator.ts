import { isFinanceHistoricalRecoveryActive } from "@/lib/finance-recovery/coordination";
import { FINANCE_RESERVED_ACCOUNT_IDS } from "@/lib/finance-recovery/reservation";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import { syncLog } from "@/lib/wildberries/sync-log";
import type { FinanceIncrementalStateStore } from "@/lib/finance-incremental/state";
import { createSupabaseFinanceIncrementalStateStore } from "@/lib/finance-incremental/state";
import {
  planFinanceIncrementalWork,
} from "@/lib/finance-incremental/week-planner";
import {
  runFinanceReportsV1PageWake,
  type FinanceIncrementalAccount,
  type FinanceReportsV1PageWakeDeps,
} from "@/lib/finance-incremental/page-wake";
import type {
  FinanceIncrementalPageResult,
  FinanceIncrementalWakeOutcome,
} from "@/lib/finance-incremental/types";

export type RunFinanceIncrementalSyncInput = {
  accountId: string;
  expectedSellerId?: string | null;
  today?: string;
  nowMs?: number;
  store?: FinanceIncrementalStateStore;
  deps?: FinanceReportsV1PageWakeDeps;
  /** When true, skip even if recovery campaign is inactive (tests). */
  ignoreRecoveryReservation?: boolean;
};

function parseHttpStatus(errors: string[]): number | null {
  for (const e of errors) {
    const m = String(e).match(/\[http\s+(\d+)\]/i);
    if (m) return Number(m[1]);
  }
  return null;
}

export function createProductionPageWakeDeps(
  store: FinanceIncrementalStateStore
): FinanceReportsV1PageWakeDeps {
  return {
    async loadAccount(accountId: string): Promise<FinanceIncrementalAccount> {
      const acc = await getMarketplaceAccountForSync(accountId);
      return {
        id: String(acc.id),
        sellerId: (acc as { seller_id?: string | null }).seller_id ?? null,
        apiKey: acc.apiKey,
      };
    },
    readState: (accountId) => store.read(accountId),
    writeState: (state) => store.write(state),
    async syncPage(input): Promise<FinanceIncrementalPageResult> {
      const svc = await createWbSyncService(input.accountId);
      const result = await svc.syncFinanceV1Page(
        input.weekFrom,
        input.weekTo,
        input.rrdId,
        "weekly"
      );
      const page = result.page;
      const errors = result.errors ?? [];
      const httpFromErr = parseHttpStatus(errors);
      const isEmpty = (result.recordsProcessed ?? 0) === 0 && !page?.hasMore;
      return {
        httpStatus: httpFromErr ?? (isEmpty ? 204 : 200),
        apiRows: result.recordsProcessed ?? 0,
        persistedLines: result.recordsUpdated ?? 0,
        hasMore: Boolean(page?.hasMore),
        isEmpty,
        nextRrdId: page?.lastRrdId ?? null,
        reportIds: result.reportIds ?? [],
        returnedFrom: result.returnedFrom ?? null,
        returnedTo: result.returnedTo ?? null,
        errors,
        remaining: page?.rateLimit?.remaining ?? null,
        limit: page?.rateLimit?.limit ?? null,
        resetSeconds: page?.rateLimit?.resetSeconds ?? null,
        retrySeconds: page?.rateLimit?.retrySeconds ?? null,
      };
    },
  };
}

/**
 * Production incremental Finance wake: one Reports/V1 detailed page.
 * Does not call list. Does not call Statistics V5.
 */
export async function runFinanceIncrementalSync(
  input: RunFinanceIncrementalSyncInput
): Promise<FinanceIncrementalWakeOutcome> {
  const accountId = String(input.accountId);
  if (
    !input.ignoreRecoveryReservation &&
    isFinanceHistoricalRecoveryActive(accountId)
  ) {
    return {
      accountId,
      status: "blocked",
      mode: "idle",
      week: null,
      cursorBefore: 0,
      cursorAfter: 0,
      weekStatus: "idle",
      httpStatus: null,
      responseRows: 0,
      persistedRows: 0,
      hasMore: null,
      httpRequests: 0,
      listCalls: 0,
      v5Calls: 0,
      retryPerformed: false,
      cursorAdvancedBeforePersist: false,
      reportsNextRequestNotBefore: null,
      reportsServerRetryUntil: null,
      remaining: null,
      limit: null,
      resetSeconds: null,
      retrySeconds: null,
      error: "skipped_finance_recovery_active",
      liveHttpAttempted: false,
    };
  }

  const store = input.store ?? createSupabaseFinanceIncrementalStateStore();
  const deps = input.deps ?? createProductionPageWakeDeps(store);
  const state = await store.read(accountId);
  const nowMs = input.nowMs ?? Date.now();
  const today = input.today ?? new Date(nowMs).toISOString().slice(0, 10);
  const plan = planFinanceIncrementalWork({ state, today });

  if (plan.kind === "idle" || !plan.week) {
    syncLog("finance-incremental", "IDLE", { accountId, reason: plan.reason });
    return {
      accountId,
      status: "idle",
      mode: "idle",
      week: plan.week,
      cursorBefore: 0,
      cursorAfter: 0,
      weekStatus: "idle",
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
    };
  }

  syncLog("finance-incremental", "WAKE PLAN", {
    accountId,
    kind: plan.kind,
    mode: plan.mode,
    week: plan.week.key,
    rrdId: plan.rrdId,
    reserved: FINANCE_RESERVED_ACCOUNT_IDS.includes(
      accountId as (typeof FINANCE_RESERVED_ACCOUNT_IDS)[number]
    ),
  });

  return runFinanceReportsV1PageWake(
    {
      accountId,
      weekFrom: plan.week.from,
      weekTo: plan.week.to,
      rrdId: plan.rrdId,
      mode: plan.mode,
      expectedSellerId: input.expectedSellerId,
      today,
      nowMs,
    },
    deps
  );
}
