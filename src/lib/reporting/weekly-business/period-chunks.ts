/**
 * Split a report scope into chronological period chunks for breakdown sheets.
 * Presentation helper only — no financial math.
 */

import type { ScopedDateRange } from "@/types/database";

export type PeriodChunk = {
  /** Display label e.g. 2026-01 or 2026-W01 */
  label: string;
  from: string;
  to: string;
  kind: "month" | "week" | "range";
};

function parseUtc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00.000Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addUtcDays(iso: string, days: number): string {
  const d = parseUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

function lastDayOfMonth(year: number, month0: number): string {
  // day 0 of next month = last day of month0
  return toIso(new Date(Date.UTC(year, month0 + 1, 0, 12, 0, 0)));
}

function diffUtcDays(from: string, to: string): number {
  const a = parseUtc(from).getTime();
  const b = parseUtc(to).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Format DD.MM.YYYY for workbook titles. */
export function formatReportDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function formatUnifiedReportTitle(from: string, to: string): string {
  return `Unified Business Report — ${formatReportDate(from)} → ${formatReportDate(to)}`;
}

/**
 * Decide chronological chunks for multi-period breakdown.
 * - Spans 2+ calendar months → monthly chunks (capped)
 * - Else span > 7 days → weekly chunks (capped)
 * - Else single period → empty (totals only)
 */
export function buildPeriodChunks(
  scope: Pick<ScopedDateRange, "from" | "to">,
  options?: { maxChunks?: number }
): PeriodChunk[] {
  const maxChunks = options?.maxChunks ?? 24;
  const from = scope.from.slice(0, 10);
  const to = scope.to.slice(0, 10);
  if (from > to) return [];

  const start = parseUtc(from);
  const end = parseUtc(to);
  const startMonthKey = `${start.getUTCFullYear()}-${start.getUTCMonth()}`;
  const endMonthKey = `${end.getUTCFullYear()}-${end.getUTCMonth()}`;
  const multiMonth = startMonthKey !== endMonthKey;
  const spanDays = diffUtcDays(from, to);

  if (!multiMonth && spanDays <= 7) {
    return [];
  }

  if (multiMonth) {
    const chunks: PeriodChunk[] = [];
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    while (chunks.length < maxChunks) {
      const monthStart = toIso(new Date(Date.UTC(y, m, 1, 12, 0, 0)));
      const monthEnd = lastDayOfMonth(y, m);
      const chunkFrom = monthStart < from ? from : monthStart;
      const chunkTo = monthEnd > to ? to : monthEnd;
      if (chunkFrom <= chunkTo) {
        const label = `${y}-${String(m + 1).padStart(2, "0")}`;
        chunks.push({ label, from: chunkFrom, to: chunkTo, kind: "month" });
      }
      if (y === end.getUTCFullYear() && m === end.getUTCMonth()) break;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return chunks;
  }

  // Same calendar month, longer than 7 days → weekly slices
  const chunks: PeriodChunk[] = [];
  let cursor = from;
  let week = 1;
  while (cursor <= to && chunks.length < maxChunks) {
    const weekEnd = addUtcDays(cursor, 6);
    const chunkTo = weekEnd > to ? to : weekEnd;
    chunks.push({
      label: `${from.slice(0, 7)}-W${String(week).padStart(2, "0")}`,
      from: cursor,
      to: chunkTo,
      kind: "week",
    });
    cursor = addUtcDays(chunkTo, 1);
    week += 1;
  }
  return chunks.length > 1 ? chunks : [];
}
