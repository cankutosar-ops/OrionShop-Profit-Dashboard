/**
 * Robust sales backfill recovery utilities (lock, progress I/O).
 *
 * Monthly window queue / adaptive splitting is superseded by weekly backfill:
 *   scripts/resume-sales-backfill.mjs + scripts/lib/sales-backfill-weekly.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve } from "path";

export const PROGRESS_DIR = resolve("exports/sales-backfill");

export const RECOVERY_DEFAULTS = {
  successCooldownMs: 5 * 60_000,
  maxSyncAttempts: 5,
  initialBackoffMs: 2 * 60_000,
  maxBackoffMs: 32 * 60_000,
  lockStaleMs: 4 * 60 * 60_000,
  minWindowDays: 1,
};

export function progressPath(accountId) {
  return resolve(PROGRESS_DIR, `progress-${accountId}.json`);
}

export function lockPath(accountId) {
  return resolve(PROGRESS_DIR, `lock-${accountId}.json`);
}

export function loadProgress(accountId) {
  const path = progressPath(accountId);
  if (!existsSync(path)) {
    return { completedWindows: {}, failedWindows: {}, pendingQueue: [], meta: {} };
  }
  const state = JSON.parse(readFileSync(path, "utf8"));
  state.completedWindows ??= {};
  state.failedWindows ??= {};
  state.pendingQueue ??= [];
  state.meta ??= {};
  return state;
}

export function saveProgress(accountId, state) {
  mkdirSync(PROGRESS_DIR, { recursive: true });
  state.meta ??= {};
  state.meta.lastSavedAt = new Date().toISOString();
  writeFileSync(progressPath(accountId), JSON.stringify(state, null, 2));
}

export function acquireLock(accountId, staleMs = RECOVERY_DEFAULTS.lockStaleMs) {
  mkdirSync(PROGRESS_DIR, { recursive: true });
  const path = lockPath(accountId);

  if (existsSync(path)) {
    const lock = JSON.parse(readFileSync(path, "utf8"));
    const age = Date.now() - new Date(lock.startedAt).getTime();
    if (age < staleMs) {
      throw new Error(
        `Backfill lock active for account ${accountId} (pid ${lock.pid}, started ${lock.startedAt}). ` +
          `Only one process may run.`
      );
    }
    console.warn(`Stale lock removed (age ${Math.round(age / 1000)}s, pid ${lock.pid})`);
  }

  const lock = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    accountId,
  };
  writeFileSync(path, JSON.stringify(lock, null, 2));
  return lock;
}

export function releaseLock(accountId) {
  const path = lockPath(accountId);
  if (existsSync(path)) {
    try {
      const lock = JSON.parse(readFileSync(path, "utf8"));
      if (lock.pid === process.pid) unlinkSync(path);
    } catch {
      // ignore
    }
  }
}

export function windowKey(window) {
  return `${window.from}:${window.to}`;
}

export function parseWindowKey(key) {
  const [from, to] = key.split(":");
  return { from, to, label: `${from} → ${to}` };
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a, b) {
  return a <= b ? a : b;
}

export function daysBetween(from, to) {
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${to}T12:00:00Z`);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Split a failed window into ~3 sub-windows (or 10-day chunks for long ranges). */
export function splitWindow(from, to) {
  const days = daysBetween(from, to);
  if (days <= RECOVERY_DEFAULTS.minWindowDays) return null;

  const parts = days > 10 ? Math.ceil(days / 10) : 3;
  const chunkDays = Math.max(1, Math.ceil(days / parts));
  const segments = [];
  let cursor = from;

  while (cursor <= to) {
    const end = minDate(to, addDays(cursor, chunkDays - 1));
    segments.push({ from: cursor, to: end, label: `${cursor} → ${end}` });
    if (end === to) break;
    cursor = addDays(end, 1);
  }

  return segments.length > 1 ? segments : null;
}

export function isRateLimitedError(message) {
  const m = message.toLowerCase();
  return message.includes("429") || m.includes("too many requests") || m.includes("rate limit");
}

export function backoffMs(attempt, initialMs = RECOVERY_DEFAULTS.initialBackoffMs) {
  const ms = initialMs * 2 ** (attempt - 1);
  return Math.min(ms, RECOVERY_DEFAULTS.maxBackoffMs);
}

export function sleep(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

/**
 * Build resume queue: pendingQueue first, then failedWindows not in completed.
 * Never includes completed window keys.
 */
export function buildResumeQueue(progress) {
  const completed = new Set(Object.keys(progress.completedWindows ?? {}));
  const seen = new Set();
  const queue = [];

  for (const item of progress.pendingQueue ?? []) {
    const key = typeof item === "string" ? item : windowKey(item);
    if (completed.has(key) || seen.has(key)) continue;
    seen.add(key);
    queue.push(typeof item === "string" ? parseWindowKey(item) : item);
  }

  for (const key of Object.keys(progress.failedWindows ?? {})) {
    if (completed.has(key) || seen.has(key)) continue;
    seen.add(key);
    queue.push(parseWindowKey(key));
  }

  return queue;
}

export function enqueueWindows(progress, windows, { front = false } = {}) {
  progress.pendingQueue ??= [];
  const completed = new Set(Object.keys(progress.completedWindows ?? {}));
  const existing = new Set(
    progress.pendingQueue.map((w) => (typeof w === "string" ? w : windowKey(w)))
  );

  const toAdd = [];
  for (const w of windows) {
    const key = windowKey(w);
    if (completed.has(key) || existing.has(key)) continue;
    toAdd.push({ from: w.from, to: w.to, label: w.label ?? `${w.from} → ${w.to}` });
    existing.add(key);
  }

  if (front) progress.pendingQueue = [...toAdd, ...progress.pendingQueue];
  else progress.pendingQueue.push(...toAdd);

  return toAdd.length;
}

export function dequeueMatching(progress, window) {
  const key = windowKey(window);
  progress.pendingQueue = (progress.pendingQueue ?? []).filter((item) => {
    const itemKey = typeof item === "string" ? item : windowKey(item);
    return itemKey !== key;
  });
}

export function checkpointSuccess(progress, accountId, window, result) {
  const key = windowKey(window);
  progress.completedWindows[key] = {
    completedAt: new Date().toISOString(),
    processed: result.recordsProcessed,
    updated: result.recordsUpdated,
    inserted: result.recordsInserted ?? 0,
  };
  delete progress.failedWindows[key];
  dequeueMatching(progress, window);
  saveProgress(accountId, progress);
}

export function checkpointFailure(progress, accountId, window, error, { attempts = 1, splitInto = null } = {}) {
  const key = windowKey(window);
  progress.failedWindows[key] = {
    failedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
    label: window.label,
    attempts,
    splitInto: splitInto?.map((w) => windowKey(w)) ?? undefined,
  };
  delete progress.completedWindows[key];
  saveProgress(accountId, progress);
}

export function checkpointSplit(progress, accountId, parentWindow, children) {
  const parentKey = windowKey(parentWindow);
  delete progress.failedWindows[parentKey];
  dequeueMatching(progress, parentWindow);
  const added = enqueueWindows(progress, children, { front: true });
  progress.meta.lastSplitAt = new Date().toISOString();
  progress.meta.lastSplitParent = parentKey;
  saveProgress(accountId, progress);
  return added;
}
