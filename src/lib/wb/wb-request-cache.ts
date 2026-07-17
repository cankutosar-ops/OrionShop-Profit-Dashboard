/**
 * Sprint 6.35.3 — Short-lived cache for repeated Wildberries / account lookups.
 * Caches external request results only — never business calculation outputs.
 * TTL covers a single navigation burst (account switch / date change).
 */

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const DEFAULT_TTL_MS = 45_000;
const store = new Map<string, CacheEntry<unknown>>();

export function cachedExternalRequest<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now) {
    void import("@/lib/perf/perf-recorder")
      .then(({ recordPerfEvent }) => {
        recordPerfEvent({
          category: "wb_api",
          name: "wb_cache.hit",
          durationMs: 0,
          meta: { key, cache: "hit" },
        });
      })
      .catch(() => {
        // ignore
      });
    return existing.value;
  }

  const value = fn().catch((error) => {
    store.delete(key);
    throw error;
  });

  store.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

/** Test/helper: clear navigation cache. */
export function clearWbRequestCache(): void {
  store.clear();
}
