/**
 * Wildberries rate-limit header helpers.
 * Official docs: X-Ratelimit-Remaining / Limit / Reset / Retry (seconds).
 * Header names are matched case-insensitively.
 */

export type WbRateLimitSnapshot = {
  remaining: number | null;
  limit: number | null;
  /** Seconds until burst replenishes (X-Ratelimit-Reset). */
  resetSeconds: number | null;
  /** Seconds until retry is allowed after 429 (X-Ratelimit-Retry). */
  retrySeconds: number | null;
  /** retrySeconds converted to milliseconds, when present. */
  retryAfterMs: number | null;
};

const HEADER_ALIASES = {
  remaining: ["x-ratelimit-remaining", "x-rate-limit-remaining"],
  limit: ["x-ratelimit-limit", "x-rate-limit-limit"],
  reset: ["x-ratelimit-reset", "x-rate-limit-reset"],
  retry: ["x-ratelimit-retry", "x-rate-limit-retry"],
} as const;

function headerMapFrom(headers: Headers): Map<string, string> {
  const map = new Map<string, string>();
  headers.forEach((value, key) => {
    map.set(key.toLowerCase(), value);
  });
  return map;
}

function readAliasedHeader(
  map: Map<string, string>,
  aliases: readonly string[]
): string | null {
  for (const name of aliases) {
    const value = map.get(name);
    if (value != null && value.trim() !== "") return value.trim();
  }
  return null;
}

function parsePositiveNumber(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Parse Wildberries `X-RateLimit-Retry` / `X-Ratelimit-Retry` (seconds until retry).
 * Returns milliseconds to wait, or null when absent/invalid.
 */
export function parseRateLimitRetryHeader(
  headerValue: string | null | undefined
): number | null {
  if (headerValue == null || headerValue.trim() === "") return null;
  const trimmed = headerValue.trim();
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.ceil(asNumber * 1000);
  }
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

/** Extract Remaining / Limit / Reset / Retry from a Fetch Headers object. */
export function parseWbRateLimitHeaders(headers: Headers): WbRateLimitSnapshot {
  const map = headerMapFrom(headers);
  const retryRaw = readAliasedHeader(map, HEADER_ALIASES.retry);
  const retryAfterMs = parseRateLimitRetryHeader(retryRaw);
  const retrySeconds =
    retryAfterMs != null ? Math.ceil(retryAfterMs / 1000) : parsePositiveNumber(retryRaw);
  return {
    remaining: parsePositiveNumber(readAliasedHeader(map, HEADER_ALIASES.remaining)),
    limit: parsePositiveNumber(readAliasedHeader(map, HEADER_ALIASES.limit)),
    resetSeconds: parsePositiveNumber(readAliasedHeader(map, HEADER_ALIASES.reset)),
    retrySeconds,
    retryAfterMs,
  };
}

/**
 * Resolve wait duration for a 429 response.
 * Prefers server header when honorServerRetry is enabled; otherwise uses caller fallback.
 */
export function resolve429WaitMs(input: {
  honorServerRetry: boolean;
  serverRetryMs: number | null;
  fallbackWaitMs: number;
}): number {
  if (input.honorServerRetry && input.serverRetryMs != null && input.serverRetryMs > 0) {
    return input.serverRetryMs;
  }
  return input.fallbackWaitMs;
}

/** Defaults for Account 2 Finance recovery pacing (official: 1 req / 1 min, burst 1). */
export const FINANCE_RECOVERY_MIN_PAGE_GAP_MS = 70_000;
export const FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS = 5_000;

/**
 * How long to wait before the next Finance page request.
 * The endpoint's documented interval is one minute with burst one. Remaining
 * is still captured for observability, but it must not shorten that interval.
 * Reset can only extend the wait. When Reset is absent on HTTP 200, the local
 * minFallbackMs floor applies — never invent a server Retry/Reset timestamp.
 */
export function computeFinancePageWaitMs(input: {
  remaining: number | null;
  resetSeconds: number | null;
  lastFinanceRequestAtMs: number | null;
  nowMs?: number;
  minFallbackMs?: number;
  safetyMarginMs?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  const minFallbackMs = input.minFallbackMs ?? FINANCE_RECOVERY_MIN_PAGE_GAP_MS;
  const safetyMarginMs =
    input.safetyMarginMs ?? FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS;
  const lastAt = input.lastFinanceRequestAtMs;

  if (lastAt == null) return 0;

  const resetBasedMs =
    input.resetSeconds != null && Number.isFinite(input.resetSeconds)
      ? Math.ceil(input.resetSeconds * 1000) + safetyMarginMs
      : null;
  const requiredGapMs = Math.max(minFallbackMs, resetBasedMs ?? minFallbackMs);
  return Math.max(0, lastAt + requiredGapMs - nowMs);
}
