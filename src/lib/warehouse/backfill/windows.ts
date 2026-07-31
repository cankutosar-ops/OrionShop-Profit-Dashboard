/**
 * Sprint 10.2 — Date window helpers for event-stream entities.
 */

export type DateWindow = { from: string; to: string };

/** Inclusive calendar-day windows of at most `windowDays` days. Dates are YYYY-MM-DD. */
export function buildInclusiveDateWindows(
  historyFrom: string,
  historyTo: string,
  windowDays = 30
): DateWindow[] {
  const from = parseDateOnly(historyFrom);
  const to = parseDateOnly(historyTo);
  if (from.getTime() > to.getTime()) return [];

  const windows: DateWindow[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const windowEnd = addDays(cursor, windowDays - 1);
    const clampedEnd = windowEnd.getTime() > to.getTime() ? to : windowEnd;
    windows.push({
      from: formatDateOnly(cursor),
      to: formatDateOnly(clampedEnd),
    });
    cursor = addDays(clampedEnd, 1);
  }
  return windows;
}

export function encodeBackfillCursor(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

export function decodeBackfillCursor(cursor: string | null | undefined): Record<string, unknown> {
  if (!cursor) return {};
  try {
    const parsed = JSON.parse(cursor) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // opaque legacy cursor
  }
  return { opaque: cursor };
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
