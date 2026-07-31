/**
 * Sprint 10.2 — Locked historical backfill entity order.
 * Do not parallelize. Do not reorder.
 */

import type { WarehousePlatformEntity } from "@/lib/warehouse/types";

/** Entities synchronized during historical backfill (inventory is out of this sprint sequence). */
export const HISTORICAL_BACKFILL_ENTITY_ORDER = [
  "products",
  "orders",
  "sales",
  "finance",
  "stocks",
  "prices",
] as const satisfies readonly WarehousePlatformEntity[];

export type HistoricalBackfillEntity = (typeof HISTORICAL_BACKFILL_ENTITY_ORDER)[number];

export const HISTORICAL_BACKFILL_MODE = "historical_backfill" as const;

/** Session meta marker — one session covers the full ordered backfill. */
export const HISTORICAL_BACKFILL_SESSION_KIND = "historical_backfill_run" as const;

/** Default date-window size (days) for orders / sales / finance. */
export const DEFAULT_BACKFILL_WINDOW_DAYS = 30;
