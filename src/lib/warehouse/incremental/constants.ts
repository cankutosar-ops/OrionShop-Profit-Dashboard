/**
 * Sprint 10.3 — Incremental sync constants.
 * Mode value is `incremental` (warehouse schema / Sprint 10.1).
 */

import type { WarehousePlatformEntity } from "@/lib/warehouse/types";

/** Entities synchronized during incremental sync (same set as historical backfill). */
export const INCREMENTAL_SYNC_ENTITY_ORDER = [
  "products",
  "orders",
  "sales",
  "finance",
  "stocks",
  "prices",
] as const satisfies readonly WarehousePlatformEntity[];

export type IncrementalSyncEntity = (typeof INCREMENTAL_SYNC_ENTITY_ORDER)[number];

/** Checkpoint / session mode — matches DB CHECK constraint. */
export const INCREMENTAL_SYNC_MODE = "incremental" as const;

/** Session meta marker for an incremental run covering ordered entities. */
export const INCREMENTAL_SYNC_SESSION_KIND = "incremental_sync_run" as const;

/** Default lookback when an incremental checkpoint has no lastSuccessfulSyncAt. */
export const DEFAULT_INCREMENTAL_LOOKBACK_HOURS = 24;
