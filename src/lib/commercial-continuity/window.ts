/**
 * Incremental date-window helpers for commercial continuity recovery.
 */

import { toDateString } from "@/lib/wildberries/mappers";

export function todayUtcDate(now = new Date()): string {
  return toDateString(now.toISOString());
}

export function addDaysIso(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenIso(latest: string | null, expected: string): number | null {
  if (!latest) return null;
  const a = Date.parse(`${latest.slice(0, 10)}T00:00:00.000Z`);
  const b = Date.parse(`${expected.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * Build incremental sync window from last known data coverage.
 * Starts at latestDataDate (inclusive re-pull) or maxLookbackDays back when empty.
 */
export function resolveCommercialSyncWindow(input: {
  latestDataDate: string | null;
  maxLookbackDays: number;
  now?: Date;
}): { dateFrom: string; dateTo: string; recoveringGap: boolean } {
  const dateTo = todayUtcDate(input.now);
  const floor = addDaysIso(dateTo, -(Math.max(1, input.maxLookbackDays) - 1));

  if (!input.latestDataDate) {
    return { dateFrom: floor, dateTo, recoveringGap: true };
  }

  const latest = input.latestDataDate.slice(0, 10);
  // Re-pull from latest day (WB cursor APIs are incremental / lastChange aware)
  let dateFrom = latest < floor ? floor : latest;
  if (dateFrom > dateTo) dateFrom = dateTo;
  const recoveringGap = latest < dateTo;
  return { dateFrom, dateTo, recoveringGap };
}
