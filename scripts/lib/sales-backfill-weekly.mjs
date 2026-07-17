/**
 * Weekly sales backfill utilities.
 * - Calendar weeks (Mon-aligned from range start, 7-day chunks)
 * - Per-week JSON checkpoints under exports/sales-backfill/{accountId}/{YYYY-MM}/
 * - Reuses legacy monthly completedWindows without re-fetch
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import {
  PROGRESS_DIR,
  windowKey,
  daysBetween,
  saveProgress,
} from "./sales-backfill-recovery.mjs";

export const WEEKLY_DEFAULTS = {
  /** Pause between successful weeks (reliability over speed). */
  successCooldownMs: 30_000,
};

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a, b) {
  return a <= b ? a : b;
}

/** True when the window spans more than two weeks (legacy monthly import). */
export function isLegacyMonthlyWindow(from, to) {
  return daysBetween(from, to) > 14;
}

/**
 * Build consecutive 7-day windows from `from` through `to`.
 * Week numbers restart each calendar month (week-01, week-02, …).
 */
export function buildWeeklyWindows(from, to) {
  const weeks = [];
  let cursor = from;
  const monthCounters = {};

  while (cursor <= to) {
    const month = cursor.slice(0, 7);
    monthCounters[month] = (monthCounters[month] ?? 0) + 1;
    const end = minDate(to, addDays(cursor, 6));

    weeks.push({
      from: cursor,
      to: end,
      month,
      weekNum: monthCounters[month],
      weekFile: `week-${String(monthCounters[month]).padStart(2, "0")}.json`,
      label: `${cursor} → ${end}`,
    });

    cursor = addDays(end, 1);
  }

  return weeks;
}

export function weekFilePath(accountId, week) {
  return resolve(PROGRESS_DIR, String(accountId), week.month, week.weekFile);
}

export function loadWeekFile(accountId, week) {
  const path = weekFilePath(accountId, week);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function saveWeekFile(accountId, week, data) {
  const path = weekFilePath(accountId, week);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function legacyCoverage(progress, week) {
  const monthlyWindows = [];
  for (const [completedKey, info] of Object.entries(progress.completedWindows ?? {})) {
    if (info.inheritedFrom) continue;
    const [cFrom, cTo] = completedKey.split(":");
    if (!cFrom || !cTo) continue;
    if (!isLegacyMonthlyWindow(cFrom, cTo)) continue;
    monthlyWindows.push({ key: completedKey, from: cFrom, to: cTo, info });
  }

  if (monthlyWindows.length === 0) return null;

  const coveringKeys = new Set();
  let cursor = week.from;
  let startInfo = null;

  while (cursor <= week.to) {
    const covering = monthlyWindows.find((w) => cursor >= w.from && cursor <= w.to);
    if (!covering) return null;
    coveringKeys.add(covering.key);
    if (cursor === week.from) startInfo = covering.info;
    cursor = addDays(cursor, 1);
  }

  const legacyKey =
    coveringKeys.size === 1 ? [...coveringKeys][0] : [...coveringKeys].sort().join("+");

  return { legacyKey, info: startInfo ?? monthlyWindows[0].info };
}

/** Whether this week is already done (week file, progress key, or legacy monthly). */
export function resolveWeekStatus(accountId, week, progress) {
  const key = windowKey(week);
  const existing = loadWeekFile(accountId, week);

  if (existing?.status === "completed" || existing?.status === "inherited") {
    return { status: existing.status, source: "week-file", weekFile: existing };
  }

  if (progress.completedWindows?.[key]) {
    return { status: "completed", source: "progress-key", progressEntry: progress.completedWindows[key] };
  }

  const legacy = legacyCoverage(progress, week);
  if (legacy) {
    return {
      status: "inherited",
      source: "legacy-monthly",
      inheritedFrom: legacy.legacyKey,
      progressEntry: legacy.info,
    };
  }

  const failed = progress.failedWindows?.[key];
  if (failed) {
    return { status: "failed", source: "progress-failed", failedEntry: failed };
  }

  if (existing?.status === "failed") {
    return { status: "failed", source: "week-file", weekFile: existing };
  }

  return { status: "pending" };
}

/**
 * Create inherited week JSON files for weeks covered by legacy monthly imports.
 * Idempotent — never overwrites completed week files.
 */
export function seedWeeklyFromLegacy(accountId, progress, from, to) {
  const weeks = buildWeeklyWindows(from, to);
  let seeded = 0;

  for (const week of weeks) {
    const resolved = resolveWeekStatus(accountId, week, progress);
    if (resolved.status !== "inherited" || resolved.source === "week-file") continue;

    const info = resolved.progressEntry ?? {};
    saveWeekFile(accountId, week, {
      dateFrom: week.from,
      dateTo: week.to,
      status: "inherited",
      source: "legacy-monthly",
      legacyWindow: resolved.inheritedFrom,
      rowsImported: info.processed ?? 0,
      rowsUpdated: info.updated ?? 0,
      retries: 0,
      completedAt: info.completedAt ?? new Date().toISOString(),
      note: "Skipped — covered by prior monthly import; no re-fetch.",
    });

    const key = windowKey(week);
    if (!progress.completedWindows[key]) {
      progress.completedWindows[key] = {
        completedAt: info.completedAt ?? new Date().toISOString(),
        processed: info.processed ?? 0,
        updated: info.updated ?? 0,
        inheritedFrom: resolved.inheritedFrom,
      };
    }
    seeded += 1;
  }

  if (seeded > 0) {
    progress.meta ??= {};
    progress.meta.weeklySeededAt = new Date().toISOString();
    saveProgress(accountId, progress);
  }

  return seeded;
}

/**
 * Reclassify failed weekly windows fully covered by completed legacy monthly imports.
 * Idempotent — only removes failed weekly keys provably covered by day-union legacy logic.
 */
export function reconcileFailedInheritedWeeks(accountId, progress, from, to) {
  const weeks = buildWeeklyWindows(from, to);
  const weekByKey = new Map(weeks.map((w) => [windowKey(w), w]));
  let reconciled = 0;
  const changes = [];

  for (const failedKey of Object.keys(progress.failedWindows ?? {})) {
    const week = weekByKey.get(failedKey);
    if (!week) continue;

    const legacy = legacyCoverage(progress, week);
    if (!legacy) continue;

    delete progress.failedWindows[failedKey];

    const info = legacy.info ?? {};
    progress.completedWindows[failedKey] = {
      completedAt: info.completedAt ?? new Date().toISOString(),
      processed: info.processed ?? 0,
      updated: info.updated ?? 0,
      inheritedFrom: legacy.legacyKey,
    };

    saveWeekFile(accountId, week, {
      dateFrom: week.from,
      dateTo: week.to,
      status: "inherited",
      source: "legacy-monthly",
      legacyWindow: legacy.legacyKey,
      rowsImported: info.processed ?? 0,
      rowsUpdated: info.updated ?? 0,
      retries: 0,
      completedAt: info.completedAt ?? new Date().toISOString(),
      note: "Reconciled — covered by prior monthly import; no re-fetch.",
    });

    reconciled += 1;
    changes.push({ week: week.label, inheritedFrom: legacy.legacyKey });
  }

  if (reconciled > 0) {
    progress.meta ??= {};
    progress.meta.reconciledAt = new Date().toISOString();
    if (changes.some((c) => progress.meta.stoppedWeek === c.week)) {
      delete progress.meta.stoppedOn429At;
      delete progress.meta.stoppedWeek;
    }
    saveProgress(accountId, progress);
  }

  return { reconciled, changes };
}

/** Pending weeks in chronological order (failed weeks retried first within pending). */
export function getPendingWeeks(accountId, from, to, progress) {
  const weeks = buildWeeklyWindows(from, to);
  const pending = [];
  const failed = [];

  for (const week of weeks) {
    const resolved = resolveWeekStatus(accountId, week, progress);
    if (resolved.status === "pending" || resolved.status === "failed") {
      const entry = { week, resolved };
      if (resolved.status === "failed") failed.push(entry);
      else pending.push(entry);
    }
  }

  return [...failed, ...pending];
}

export function checkpointWeekSuccess(accountId, progress, week, result, { retries = 0 } = {}) {
  const key = windowKey(week);
  const completedAt = new Date().toISOString();

  progress.completedWindows[key] = {
    completedAt,
    processed: result.recordsProcessed,
    updated: result.recordsUpdated,
    inserted: result.recordsInserted ?? 0,
  };
  delete progress.failedWindows[key];

  saveWeekFile(accountId, week, {
    dateFrom: week.from,
    dateTo: week.to,
    status: "completed",
    rowsImported: result.recordsProcessed,
    rowsUpdated: result.recordsUpdated,
    retries,
    completedAt,
  });

  progress.meta ??= {};
  progress.meta.strategy = "weekly";
  saveProgress(accountId, progress);
}

export function checkpointWeekFailure(accountId, progress, week, error, { retries = 0 } = {}) {
  const key = windowKey(week);
  const failedAt = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);

  progress.failedWindows[key] = {
    failedAt,
    error: message,
    label: week.label,
    retries,
  };
  delete progress.completedWindows[key];

  saveWeekFile(accountId, week, {
    dateFrom: week.from,
    dateTo: week.to,
    status: "failed",
    rowsImported: 0,
    rowsUpdated: 0,
    retries,
    failedAt,
    error: message.slice(0, 500),
  });

  progress.meta ??= {};
  progress.meta.strategy = "weekly";
  saveProgress(accountId, progress);
}
