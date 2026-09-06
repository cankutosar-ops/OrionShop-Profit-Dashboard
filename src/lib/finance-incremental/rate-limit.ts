import {
  computeFinancePageWaitMs,
  FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
  FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS,
} from "@/lib/wildberries/rate-limit-retry";
import type { FinanceIncrementalSyncState } from "@/lib/finance-incremental/types";

export function reportsIncrementalBlockedUntil(
  state: FinanceIncrementalSyncState | null,
  nowMs = Date.now()
): string | null {
  const candidates = [
    state?.reportsServerRetryUntil ?? null,
    state?.reportsNextRequestNotBefore ?? null,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value) && value > nowMs);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

export function applyReportsPacingAfterRequest(input: {
  state: FinanceIncrementalSyncState;
  nowMs: number;
  remaining: number | null;
  limit: number | null;
  resetSeconds: number | null;
  retrySeconds: number | null;
  httpStatus: number;
}): FinanceIncrementalSyncState {
  const nowIso = new Date(input.nowMs).toISOString();
  const waitMs = computeFinancePageWaitMs({
    remaining: input.remaining,
    resetSeconds: input.resetSeconds,
    lastFinanceRequestAtMs: input.nowMs,
    nowMs: input.nowMs,
    minFallbackMs: FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
    safetyMarginMs: FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS,
  });
  const nextNotBefore = new Date(input.nowMs + Math.max(waitMs, FINANCE_RECOVERY_MIN_PAGE_GAP_MS)).toISOString();

  let reportsServerRetryUntil = input.state.reportsServerRetryUntil;
  if (input.httpStatus === 429) {
    const serverMs =
      input.retrySeconds != null && Number.isFinite(input.retrySeconds)
        ? input.retrySeconds * 1000
        : input.resetSeconds != null && Number.isFinite(input.resetSeconds)
          ? input.resetSeconds * 1000
          : null;
    reportsServerRetryUntil =
      serverMs != null && serverMs > 0
        ? new Date(input.nowMs + serverMs + FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS).toISOString()
        : null;
  }

  return {
    ...input.state,
    reportsLastRequestAt: nowIso,
    reportsNextRequestNotBefore: nextNotBefore,
    reportsServerRetryUntil,
    reportsLastRateLimitSnapshot: {
      remaining: input.remaining,
      limit: input.limit,
      resetSeconds: input.resetSeconds,
      retrySeconds: input.retrySeconds,
      capturedAt: nowIso,
    },
    updatedAt: nowIso,
  };
}

export function isFinanceHttp429(errors: string[]): boolean {
  return errors.some((e) => {
    const msg = String(e ?? "");
    if (/\bFINANCE_HTTP_429\b/.test(msg)) return true;
    if (/\[http\s*429\]/i.test(msg)) return true;
    if (/\bWB API error 429\b/i.test(msg)) return true;
    if (/\btoo many requests\b/i.test(msg)) return true;
    if (
      /\b429\b/.test(msg) &&
      !/headers missing|ambiguous|Remaining\/Reset required|missing_rate_limit_headers/i.test(msg)
    ) {
      return true;
    }
    return false;
  });
}
