/**
 * Sprint 10.3 — Determine incremental fetch windows from checkpoints.
 * No historical replay — only changes since last successful sync.
 */

import type { WarehouseCheckpointRecord } from "@/lib/warehouse/checkpoints/types";
import { DEFAULT_INCREMENTAL_LOOKBACK_HOURS } from "@/lib/warehouse/incremental/constants";

export type IncrementalFetchWindow = {
  from: string;
  to: string;
  /** ISO timestamp used as adapter cursor hint when present. */
  cursor: string | null;
};

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function hoursAgoIso(hours: number, now = new Date()): string {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

/**
 * Build the incremental change window for an entity checkpoint.
 * Prefer lastSuccessfulSyncAt, then cursor timestamp, then lookback.
 */
export function determineIncrementalWindow(
  checkpoint: WarehouseCheckpointRecord | null,
  options?: {
    now?: Date;
    lookbackHours?: number;
    /** Fallback seed (e.g. historical backfill last success). */
    seedFrom?: string | null;
  }
): IncrementalFetchWindow {
  const now = options?.now ?? new Date();
  const toIso = now.toISOString();
  const lookbackHours = options?.lookbackHours ?? DEFAULT_INCREMENTAL_LOOKBACK_HOURS;

  const fromCandidate =
    checkpoint?.lastSuccessfulSyncAt ??
    (typeof checkpoint?.cursor === "string" && /^\d{4}-\d{2}-\d{2}/.test(checkpoint.cursor)
      ? checkpoint.cursor
      : null) ??
    options?.seedFrom ??
    hoursAgoIso(lookbackHours, now);

  let fromIso = fromCandidate;
  if (new Date(fromIso).getTime() > now.getTime()) {
    fromIso = hoursAgoIso(lookbackHours, now);
  }

  return {
    from: toDateOnly(fromIso),
    to: toDateOnly(toIso),
    cursor: checkpoint?.cursor ?? fromIso,
  };
}
