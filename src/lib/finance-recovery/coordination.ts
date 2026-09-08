/**
 * Durable coordination for historical Finance recovery vs Commercial Continuity.
 * State lives in the recovery progress JSON (survives process restart).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

import { FINANCE_RECOVERY_STALE_LOCK_MS } from "@/lib/commercial-continuity/execution-bounds";
import {
  FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
  FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS,
} from "@/lib/wildberries/rate-limit-retry";

import { resolveFinanceRecoveryReservation } from "./reservation";

export const DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH = resolve(
  "exports/finance-backfill/account-2-recovery-progress.json"
);

export type FinanceRecoveryCompletedPage = {
  page: number;
  startRrdId: number;
  endRrdId: number;
  apiRows: number;
  upsertedLines: number;
  persistedAt: string;
};

export type FinanceRecoveryActiveChunk = {
  key: string;
  chunkFrom: string;
  chunkTo: string;
  status: "in_progress" | "blocked_partial" | "failed";
  currentPage: number;
  lastPersistedRrdId: number;
  completedPages: FinanceRecoveryCompletedPage[];
  /** Reports V1 weekly/daily period for this chunk. */
  reportPeriod?: "weekly" | "daily";
  /** Distinct reportId values observed on persisted pages. */
  reportIdsSeen?: number[];
  /** Must remain finance_v1_sales_reports_detailed for Account 2. */
  apiSource?: string;
};

export type FinanceRecoveryCampaignStatus =
  | "inactive"
  | "active"
  | "completed"
  | "aborted";

export type FinanceRecoveryTerminalStatus =
  | "probe_ok"
  | "wake_ok"
  | "completed"
  | "blocked_partial"
  | "failed"
  | "partial";

/**
 * Pure terminal-status resolver for Finance recovery / probe / wake runs.
 * Successful one-page wake with more data remaining → wake_ok (never blocked_partial).
 */
export function resolveFinanceRecoveryTerminalStatus(input: {
  rateLimited: boolean;
  failed: boolean;
  probeOnly: boolean;
  probeSucceeded: boolean;
  wakeSucceeded: boolean;
  morePagesRemaining: boolean;
  completedChunkCount: number;
  totalChunkCount: number;
}): FinanceRecoveryTerminalStatus {
  if (input.rateLimited) return "blocked_partial";
  if (input.failed) return "failed";
  if (input.probeOnly && input.probeSucceeded) return "probe_ok";
  if (input.completedChunkCount >= input.totalChunkCount && input.totalChunkCount > 0) {
    return "completed";
  }
  if (input.wakeSucceeded && input.morePagesRemaining) return "wake_ok";
  if (input.wakeSucceeded) return "wake_ok";
  return "partial";
}

/** Re-export pacing helpers used by the Account 2 recovery script. */
export {
  computeFinancePageWaitMs,
  FINANCE_RECOVERY_MIN_PAGE_GAP_MS,
} from "@/lib/wildberries/rate-limit-retry";

export type FinanceRecoveryProgressState = {
  accountId: string;
  status?: string;
  /** Campaign reservation for Account 2 Finance (survives wake exit). */
  campaignStatus?: FinanceRecoveryCampaignStatus;
  campaignActivatedAt?: string | null;
  campaignCompletedAt?: string | null;
  campaignAbortedAt?: string | null;
  activeChunk?: FinanceRecoveryActiveChunk | null;
  /** Wake lock: true only while a recovery process is running. */
  recoveryActive?: boolean;
  lockPid?: number | null;
  lockStartedAt?: string | null;
  lockUpdatedAt?: string | null;
  /**
   * Legacy / Statistics-era rate-limit evidence (e.g. V5 429 Reset).
   * Preserved for audit. Must NOT gate Sales Reports V1 wakes.
   */
  serverRetryAfterMs?: number | null;
  serverRetryUntil?: string | null;
  /** @deprecated Prefer reportsLastRequestAt for Reports wakes. Legacy V5-era stamp. */
  lastFinanceRequestAt?: string | null;
  /** @deprecated Prefer reportsNextRequestNotBefore for Reports wakes. Legacy V5-era gate. */
  nextFinanceRequestNotBefore?: string | null;
  lastRateLimitSnapshot?: {
    remaining: number | null;
    limit: number | null;
    resetSeconds: number | null;
    retrySeconds: number | null;
    capturedAt: string;
  } | null;
  /**
   * Reports / Sales Reports V1 (finance-api) rate-limit state.
   * Independent from Statistics V5 serverRetryUntil / nextFinanceRequestNotBefore.
   */
  reportsServerRetryAfterMs?: number | null;
  reportsServerRetryUntil?: string | null;
  reportsLastRequestAt?: string | null;
  reportsNextRequestNotBefore?: string | null;
  reportsLastRateLimitSnapshot?: {
    remaining: number | null;
    limit: number | null;
    resetSeconds: number | null;
    retrySeconds: number | null;
    capturedAt: string;
  } | null;
  reportsRequestGateInitializedAt?: string | null;
  reportsRequestGateReason?: string | null;
  /** Account 2 Reports recovery source marker (detailed Sales Reports V1). */
  apiSource?: string | null;
  /** Durable Reports week snapshot (mirrors activeChunk for restart safety). */
  reportsWeek?: {
    periodFrom: string;
    periodTo: string;
    period: "weekly" | "daily";
    key: string;
    lastPersistedRrdId: number;
    currentPage: number;
    reportIdsSeen: number[];
    status?: FinanceRecoveryActiveChunk["status"] | "completed";
  } | null;
  completedChunks?: Record<string, unknown>;
  [key: string]: unknown;
};

export function normalizeFinanceRecoveryCampaignStatus(
  state: FinanceRecoveryProgressState | null
): FinanceRecoveryCampaignStatus {
  const raw = state?.campaignStatus;
  if (raw === "active" || raw === "completed" || raw === "aborted" || raw === "inactive") {
    return raw;
  }
  return "inactive";
}

/**
 * Campaign ACTIVE means Account 2 Finance is reserved for historical recovery
 * between wakes (Commercial Continuity must skip Finance).
 */
export function isFinanceRecoveryCampaignActive(
  marketplaceAccountId: string,
  progressPath = DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH
): boolean {
  // Deployed cron/API instances cannot see an operator workstation's progress
  // file, so the reservation resolver treats the deployed env var as
  // authoritative and blocks whenever ownership is undeterminable.
  return resolveFinanceRecoveryReservation(marketplaceAccountId, progressPath).reserved;
}

/**
 * Activate the durable campaign reservation. Idempotent while already ACTIVE.
 * Does not acquire a wake lock and does not call Wildberries.
 */
export function activateFinanceRecoveryCampaign(input: {
  marketplaceAccountId: string;
  progress: FinanceRecoveryProgressState;
  progressPath?: string;
}): FinanceRecoveryProgressState {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const existing = readProgress(path);
  const now = new Date().toISOString();
  const current = normalizeFinanceRecoveryCampaignStatus(existing ?? input.progress);
  if (current === "completed") {
    throw new Error(
      "Cannot activate Finance recovery campaign: campaign is already completed"
    );
  }
  if (current === "aborted") {
    // Explicit re-activation after abort is allowed for a new campaign.
  }
  const next: FinanceRecoveryProgressState = {
    ...(existing ?? {}),
    ...input.progress,
    accountId: input.marketplaceAccountId,
    campaignStatus: "active",
    campaignActivatedAt:
      current === "active"
        ? (existing?.campaignActivatedAt ?? input.progress.campaignActivatedAt ?? now)
        : now,
    campaignCompletedAt: null,
    campaignAbortedAt: null,
    updatedAt: now,
  };
  writeProgress(path, next);
  return next;
}

/**
 * Mark campaign COMPLETED only when the full historical recovery target is done.
 */
export function completeFinanceRecoveryCampaign(input: {
  marketplaceAccountId: string;
  progress: FinanceRecoveryProgressState;
  progressPath?: string;
}): FinanceRecoveryProgressState {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const now = new Date().toISOString();
  const next: FinanceRecoveryProgressState = {
    ...input.progress,
    accountId: input.marketplaceAccountId,
    campaignStatus: "completed",
    campaignCompletedAt: now,
    recoveryActive: false,
    lockPid: null,
    updatedAt: now,
  };
  writeProgress(path, next);
  return next;
}

/**
 * Explicit administrative abort. Does not delete Finance rows or roll back pages.
 */
export function abortFinanceRecoveryCampaign(input: {
  marketplaceAccountId: string;
  progressPath?: string;
  reason?: string;
}): FinanceRecoveryProgressState {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const existing = readProgress(path);
  if (!existing || String(existing.accountId) !== String(input.marketplaceAccountId)) {
    throw new Error(
      `Cannot abort Finance recovery campaign: no progress for account ${input.marketplaceAccountId}`
    );
  }
  const now = new Date().toISOString();
  const next: FinanceRecoveryProgressState = {
    ...existing,
    campaignStatus: "aborted",
    campaignAbortedAt: now,
    recoveryActive: false,
    lockPid: null,
    lockUpdatedAt: now,
    status: "aborted",
    abortReason: input.reason ?? "explicit_abort",
    updatedAt: now,
    finishedAt: now,
  };
  writeProgress(path, next);
  return next;
}

/**
 * After a wake resolves terminal status, keep campaign ACTIVE unless fully completed.
 * A 429 / wake_ok / probe_ok / blocked_partial must NOT complete or abort the campaign.
 */
export function applyCampaignStatusAfterWake(input: {
  progress: FinanceRecoveryProgressState;
  terminalStatus: FinanceRecoveryTerminalStatus;
  completedChunkCount: number;
  totalChunkCount: number;
}): FinanceRecoveryProgressState {
  const campaignDone =
    input.terminalStatus === "completed" &&
    input.completedChunkCount >= input.totalChunkCount &&
    input.totalChunkCount > 0 &&
    !input.progress.activeChunk;

  if (campaignDone) {
    return {
      ...input.progress,
      campaignStatus: "completed",
      campaignCompletedAt: new Date().toISOString(),
    };
  }

  const current = normalizeFinanceRecoveryCampaignStatus(input.progress);
  if (current === "aborted" || current === "completed") {
    return input.progress;
  }
  return {
    ...input.progress,
    campaignStatus: "active",
  };
}

/**
 * Legacy combined cooldown (includes Statistics-era serverRetryUntil).
 * Do NOT use for Account 2 Reports / Sales Reports V1 wakes — use
 * isReportsRecoveryCooldownActive instead.
 */
export function isFinanceRecoveryCooldownActive(
  state: FinanceRecoveryProgressState | null,
  nowMs = Date.now()
): boolean {
  return financeRecoveryRequestBlockedUntil(state, nowMs) != null;
}

/** Legacy blocked-until: V5/legacy fields only (not Reports-specific). */
export function financeRecoveryRequestBlockedUntil(
  state: FinanceRecoveryProgressState | null,
  nowMs = Date.now()
): string | null {
  const candidates = [
    state?.serverRetryUntil ?? null,
    state?.nextFinanceRequestNotBefore ?? null,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value) && value > nowMs);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

/**
 * Reports / Sales Reports V1 cooldown — ignores Statistics V5 serverRetryUntil
 * and legacy nextFinanceRequestNotBefore.
 */
export function isReportsRecoveryCooldownActive(
  state: FinanceRecoveryProgressState | null,
  nowMs = Date.now()
): boolean {
  return reportsRecoveryRequestBlockedUntil(state, nowMs) != null;
}

export function reportsRecoveryRequestBlockedUntil(
  state: FinanceRecoveryProgressState | null,
  nowMs = Date.now()
): string | null {
  const candidates = [
    state?.reportsServerRetryUntil ?? null,
    state?.reportsNextRequestNotBefore ?? null,
  ]
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value) && value > nowMs);
  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates)).toISOString();
}

/**
 * Pure proof: a future Statistics-era serverRetryUntil must not block Reports
 * when reports* gates are clear.
 */
export function statisticsCooldownDoesNotBlockReports(input: {
  state: FinanceRecoveryProgressState | null;
  nowMs?: number;
}): boolean {
  const nowMs = input.nowMs ?? Date.now();
  const legacyBlocked = isFinanceRecoveryCooldownActive(input.state, nowMs);
  const reportsBlocked = isReportsRecoveryCooldownActive(input.state, nowMs);
  // When only legacy V5 fields are in the future, Reports must remain unblocked.
  if (legacyBlocked && !reportsBlocked) return true;
  if (!legacyBlocked && !reportsBlocked) return true;
  return !reportsBlocked;
}

/**
 * Conservative gate for the first request made after the rate-limit safeguards
 * were introduced: one complete documented Finance interval plus the same
 * safety margin already applied to server-provided Reset values.
 */
export const FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS =
  FINANCE_RECOVERY_MIN_PAGE_GAP_MS + FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS;

/** Timing state is usable only when a parsable next-request instant is persisted. */
export function hasFinanceRequestTimingState(
  state: FinanceRecoveryProgressState | null
): boolean {
  const next = state?.nextFinanceRequestNotBefore;
  return typeof next === "string" && Number.isFinite(Date.parse(next));
}

/** Reports V1 timing state — independent of legacy V5 nextFinanceRequestNotBefore. */
export function hasReportsRequestTimingState(
  state: FinanceRecoveryProgressState | null
): boolean {
  const next = state?.reportsNextRequestNotBefore;
  return typeof next === "string" && Number.isFinite(Date.parse(next));
}

/**
 * Fail closed when the persisted timing state is missing: write a conservative
 * gate to disk (so a restart cannot bypass it) instead of assuming the previous
 * request's unrecorded headers allow an immediate call. No WB request is needed
 * to establish readiness — only elapsed wall-clock time.
 */
export function ensureFinanceRequestGate(input: {
  progress: FinanceRecoveryProgressState;
  progressPath?: string;
  nowMs?: number;
}): {
  state: FinanceRecoveryProgressState;
  gateUntil: string;
  initialized: boolean;
} {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const nowMs = input.nowMs ?? Date.now();

  if (hasFinanceRequestTimingState(input.progress)) {
    return {
      state: input.progress,
      gateUntil: String(input.progress.nextFinanceRequestNotBefore),
      initialized: false,
    };
  }

  const gateUntil = new Date(nowMs + FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS).toISOString();
  const state: FinanceRecoveryProgressState = {
    ...input.progress,
    // Unknown, and never fabricated: the previous wake predates this field.
    lastFinanceRequestAt: input.progress.lastFinanceRequestAt ?? null,
    lastRateLimitSnapshot: input.progress.lastRateLimitSnapshot ?? null,
    nextFinanceRequestNotBefore: gateUntil,
    financeRequestGateInitializedAt: new Date(nowMs).toISOString(),
    financeRequestGateReason: "missing_persisted_rate_limit_state",
  };
  writeProgress(path, state);
  const persisted = readProgress(path);
  if (!hasFinanceRequestTimingState(persisted)) {
    throw new Error(
      "Failed to persist Finance request timing gate — fail closed, no Wildberries request"
    );
  }
  return { state: persisted ?? state, gateUntil, initialized: true };
}

/**
 * Reports / Sales Reports V1 first-request gate.
 * Never copies Statistics V5 serverRetryUntil / nextFinanceRequestNotBefore.
 * Missing reports* timing → persist a short conservative Reports gate and stop.
 */
export function ensureReportsRequestGate(input: {
  progress: FinanceRecoveryProgressState;
  progressPath?: string;
  nowMs?: number;
}): {
  state: FinanceRecoveryProgressState;
  gateUntil: string;
  initialized: boolean;
} {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const nowMs = input.nowMs ?? Date.now();

  if (hasReportsRequestTimingState(input.progress)) {
    return {
      state: input.progress,
      gateUntil: String(input.progress.reportsNextRequestNotBefore),
      initialized: false,
    };
  }

  const gateUntil = new Date(nowMs + FINANCE_RECOVERY_FIRST_REQUEST_GATE_MS).toISOString();
  const state: FinanceRecoveryProgressState = {
    ...input.progress,
    // Preserve V5 historical evidence; do not reinterpret it as Reports cooldown.
    reportsLastRequestAt: input.progress.reportsLastRequestAt ?? null,
    reportsLastRateLimitSnapshot: input.progress.reportsLastRateLimitSnapshot ?? null,
    reportsNextRequestNotBefore: gateUntil,
    reportsRequestGateInitializedAt: new Date(nowMs).toISOString(),
    reportsRequestGateReason: "missing_reports_rate_limit_state",
  };
  writeProgress(path, state);
  const persisted = readProgress(path);
  if (!hasReportsRequestTimingState(persisted)) {
    throw new Error(
      "Failed to persist Reports request timing gate — fail closed, no Wildberries request"
    );
  }
  return { state: persisted ?? state, gateUntil, initialized: true };
}

export function activeFinanceChunkFor(
  state: FinanceRecoveryProgressState,
  chunkFrom: string,
  chunkTo: string
): FinanceRecoveryActiveChunk {
  const key = `${chunkFrom}:${chunkTo}`;
  if (
    state.activeChunk?.key === key &&
    state.activeChunk.chunkFrom === chunkFrom &&
    state.activeChunk.chunkTo === chunkTo
  ) {
    return state.activeChunk;
  }
  return {
    key,
    chunkFrom,
    chunkTo,
    status: "in_progress",
    currentPage: 1,
    lastPersistedRrdId: 0,
    completedPages: [],
    reportPeriod: "weekly",
    reportIdsSeen: [],
    apiSource: "finance_v1_sales_reports_detailed",
  };
}

export function withPersistedFinancePage(input: {
  state: FinanceRecoveryProgressState;
  activeChunk: FinanceRecoveryActiveChunk;
  startRrdId: number;
  endRrdId: number;
  apiRows: number;
  upsertedLines: number;
  persistedAt?: string;
  reportIds?: number[];
  reportPeriod?: "weekly" | "daily";
  apiSource?: string;
}): FinanceRecoveryProgressState {
  const persistedAt = input.persistedAt ?? new Date().toISOString();
  const completedPage: FinanceRecoveryCompletedPage = {
    page: input.activeChunk.currentPage,
    startRrdId: input.startRrdId,
    endRrdId: input.endRrdId,
    apiRows: input.apiRows,
    upsertedLines: input.upsertedLines,
    persistedAt,
  };
  const reportIdsSeen = [
    ...new Set([
      ...(input.activeChunk.reportIdsSeen ?? []),
      ...(input.reportIds ?? []),
    ]),
  ]
    .filter((id) => Number.isSafeInteger(id))
    .sort((a, b) => a - b);
  const reportPeriod =
    input.reportPeriod ?? input.activeChunk.reportPeriod ?? "weekly";
  const apiSource =
    input.apiSource ??
    input.activeChunk.apiSource ??
    input.state.apiSource ??
    "finance_v1_sales_reports_detailed";
  const activeChunk: FinanceRecoveryActiveChunk = {
    ...input.activeChunk,
    status: "in_progress",
    currentPage: input.activeChunk.currentPage + 1,
    lastPersistedRrdId: input.endRrdId,
    completedPages: [...input.activeChunk.completedPages, completedPage],
    reportPeriod,
    reportIdsSeen,
    apiSource,
  };
  return {
    ...input.state,
    status: "running",
    apiSource,
    activeChunk,
    reportsWeek: {
      periodFrom: activeChunk.chunkFrom,
      periodTo: activeChunk.chunkTo,
      period: reportPeriod,
      key: activeChunk.key,
      lastPersistedRrdId: activeChunk.lastPersistedRrdId,
      currentPage: activeChunk.currentPage,
      reportIdsSeen,
      status: activeChunk.status,
    },
  };
}

function readProgress(path: string): FinanceRecoveryProgressState | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as FinanceRecoveryProgressState;
  } catch {
    return null;
  }
}

function writeProgress(path: string, state: FinanceRecoveryProgressState): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

function isProcessAlive(pid: number | null | undefined): boolean {
  if (pid == null || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isFinanceRecoveryLockStale(
  state: FinanceRecoveryProgressState | null,
  staleMs = FINANCE_RECOVERY_STALE_LOCK_MS
): boolean {
  if (!state?.recoveryActive) return false;
  if (state.lockPid != null && isProcessAlive(state.lockPid)) {
    const updated = Date.parse(String(state.lockUpdatedAt ?? state.lockStartedAt ?? 0));
    if (Number.isFinite(updated) && Date.now() - updated > staleMs) {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Commercial Continuity Finance skip gate.
 * Campaign ACTIVE reserves Account 2 Finance for the whole recovery campaign
 * (survives wake exit). Wake-level recoveryActive alone is insufficient.
 */
export function isFinanceHistoricalRecoveryActive(
  marketplaceAccountId: string,
  progressPath = DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH
): boolean {
  return isFinanceRecoveryCampaignActive(marketplaceAccountId, progressPath);
}

export function acquireFinanceRecoveryCoordination(input: {
  marketplaceAccountId: string;
  progressPath?: string;
  progress: FinanceRecoveryProgressState;
}): { ok: true } | { ok: false; reason: string } {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const existing = readProgress(path);
  if (
    existing?.recoveryActive &&
    String(existing.accountId) === String(input.marketplaceAccountId) &&
    !isFinanceRecoveryLockStale(existing) &&
    existing.lockPid !== process.pid
  ) {
    return {
      ok: false,
      reason: `Finance recovery already active (pid=${existing.lockPid}, started=${existing.lockStartedAt})`,
    };
  }
  const now = new Date().toISOString();
  const next: FinanceRecoveryProgressState = {
    ...input.progress,
    accountId: input.marketplaceAccountId,
    recoveryActive: true,
    lockPid: process.pid,
    lockStartedAt: existing?.lockStartedAt ?? now,
    lockUpdatedAt: now,
    status: input.progress.status ?? "running",
    // Wake acquisition must not clear an active campaign reservation.
    campaignStatus:
      normalizeFinanceRecoveryCampaignStatus(input.progress) === "inactive"
        ? normalizeFinanceRecoveryCampaignStatus(existing) === "active"
          ? "active"
          : input.progress.campaignStatus
        : input.progress.campaignStatus,
  };
  writeProgress(path, next);
  return { ok: true };
}

export function touchFinanceRecoveryCoordination(
  marketplaceAccountId: string,
  progressPath = DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH
): void {
  const state = readProgress(progressPath);
  if (!state || String(state.accountId) !== String(marketplaceAccountId)) return;
  if (!state.recoveryActive) return;
  writeProgress(progressPath, {
    ...state,
    lockPid: process.pid,
    lockUpdatedAt: new Date().toISOString(),
  });
}

export function releaseFinanceRecoveryCoordination(input: {
  marketplaceAccountId: string;
  progressPath?: string;
  progress: FinanceRecoveryProgressState;
  finalStatus: string;
}): void {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const now = new Date().toISOString();
  const campaignStatus = normalizeFinanceRecoveryCampaignStatus(input.progress);
  writeProgress(path, {
    ...input.progress,
    accountId: input.marketplaceAccountId,
    // Clear wake lock only — campaign reservation persists across wakes.
    recoveryActive: false,
    lockPid: null,
    lockUpdatedAt: now,
    status: input.finalStatus,
    finishedAt: now,
    campaignStatus:
      campaignStatus === "inactive" && input.finalStatus === "completed"
        ? "completed"
        : campaignStatus === "inactive"
          ? "inactive"
          : campaignStatus,
  });
}

export function releaseStaleFinanceRecoveryCoordination(
  marketplaceAccountId: string,
  progressPath = DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH
): boolean {
  const state = readProgress(progressPath);
  if (!state || String(state.accountId) !== String(marketplaceAccountId)) return false;
  if (!state.recoveryActive) return false;
  if (!isFinanceRecoveryLockStale(state)) return false;
  writeProgress(progressPath, {
    ...state,
    recoveryActive: false,
    lockPid: null,
    status: state.status === "running" ? "stale" : state.status,
    staleReleasedAt: new Date().toISOString(),
  });
  return true;
}

export function recordFinanceRecovery429Hint(input: {
  progress: FinanceRecoveryProgressState;
  serverRetryAfterMs: number | null;
  progressPath?: string;
}): FinanceRecoveryProgressState {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const serverRetryUntil =
    input.serverRetryAfterMs != null && input.serverRetryAfterMs > 0
      ? new Date(
          Date.now() +
            input.serverRetryAfterMs +
            FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS
        ).toISOString()
      : null;
  const next = {
    ...input.progress,
    serverRetryAfterMs: input.serverRetryAfterMs,
    serverRetryUntil,
    updatedAt: new Date().toISOString(),
  };
  writeProgress(path, next);
  return next;
}

/** Persist a Reports / Sales Reports V1 429 cooldown (never writes V5 fields). */
export function recordReportsRecovery429Hint(input: {
  progress: FinanceRecoveryProgressState;
  serverRetryAfterMs: number | null;
  progressPath?: string;
}): FinanceRecoveryProgressState {
  const path = input.progressPath ?? DEFAULT_ACCOUNT2_RECOVERY_PROGRESS_PATH;
  const reportsServerRetryUntil =
    input.serverRetryAfterMs != null && input.serverRetryAfterMs > 0
      ? new Date(
          Date.now() +
            input.serverRetryAfterMs +
            FINANCE_RECOVERY_RESET_SAFETY_MARGIN_MS
        ).toISOString()
      : null;
  const next: FinanceRecoveryProgressState = {
    ...input.progress,
    reportsServerRetryAfterMs: input.serverRetryAfterMs,
    reportsServerRetryUntil,
    updatedAt: new Date().toISOString(),
  };
  writeProgress(path, next);
  return next;
}
