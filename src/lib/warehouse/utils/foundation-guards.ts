/**
 * Sprint 10.1 / 10.2 / 10.3 — Warehouse capability guards.
 *
 * Warehouse package itself still must not call marketplace HTTP hosts.
 * Marketplace adapters live outside `src/lib/warehouse` and perform HTTP.
 */

/** Warehouse package must not invoke marketplace HTTP clients directly. */
export const WAREHOUSE_FOUNDATION_ALLOWS_MARKETPLACE_HTTP = false as const;

/**
 * @deprecated Prefer WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL / WAREHOUSE_ALLOWS_INCREMENTAL_SYNC.
 * Kept for Sprint 10.1 verify compatibility.
 */
export const WAREHOUSE_FOUNDATION_ALLOWS_SYNC_EXECUTION = true as const;

/** Sprint 10.2 — Historical backfill engine may execute. */
export const WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL = true as const;

/** Sprint 10.3 — Incremental sync engine may execute (gated by historical eligibility). */
export const WAREHOUSE_ALLOWS_INCREMENTAL_SYNC = true as const;

/** Sprint 10.4 — Scheduler / queue / monitoring ops may execute. */
export const WAREHOUSE_ALLOWS_OPS_SCHEDULER = true as const;

export function assertWarehouseFoundationOnly(feature: string): void {
  if (feature === "historical_backfill" && WAREHOUSE_ALLOWS_HISTORICAL_BACKFILL) return;
  if (feature === "incremental_sync" && WAREHOUSE_ALLOWS_INCREMENTAL_SYNC) return;
  if (WAREHOUSE_FOUNDATION_ALLOWS_SYNC_EXECUTION && feature === "historical_backfill") return;
  if (feature === "incremental_sync" && !WAREHOUSE_ALLOWS_INCREMENTAL_SYNC) {
    throw new Error(
      `Warehouse does not execute "${feature}". Incremental sync is deferred to a later sprint.`
    );
  }
  if (!WAREHOUSE_FOUNDATION_ALLOWS_SYNC_EXECUTION) {
    throw new Error(
      `Warehouse foundation (Sprint 10.1) does not execute "${feature}". Deferred to Sprint 10.2+.`
    );
  }
}

export function assertIncrementalSyncNotEnabled(feature = "incremental_sync"): void {
  if (WAREHOUSE_ALLOWS_INCREMENTAL_SYNC) return;
  throw new Error(`Warehouse does not execute "${feature}".`);
}
