/**
 * New marketplace account lifecycle:
 * NEW_ACCOUNT → HISTORICAL_BACKFILL_* → INCREMENTAL_SYNC_ACTIVE → HEALTHY
 * Existing accounts: ACCOUNT_VERIFICATION → (pass) → INCREMENTAL_SYNC_ACTIVE → HEALTHY
 *
 * HEALTHY is earned only after verification — never by migration alone.
 */
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { containmentServerAuthHeader } from "@/lib/security/containment-gate";
import { syncLog } from "@/lib/wildberries/sync-log";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import {
  buildFinanceBackfillWindows,
  hasFatalSyncErrors,
  runFinanceHistoryBackfill,
} from "@/lib/wildberries/finance-history-backfill";
import {
  markAccountSyncFinished,
  markAccountSyncStarted,
  touchAccountSyncHeartbeat,
} from "@/services/marketplace-account-service";
import type {
  FinanceBackfillProgress,
  MarketplaceType,
  SyncLifecycleStatus,
  WbFinance,
} from "@/types/database";

export const INCREMENTAL_READY_STATUSES: ReadonlySet<SyncLifecycleStatus> = new Set([
  "INCREMENTAL_SYNC_ACTIVE",
  "HEALTHY",
  "RECOVERING",
]);

export type AccountLifecycleState = {
  id: string;
  marketplace: MarketplaceType;
  sync_enabled: boolean;
  sync_lifecycle_status: SyncLifecycleStatus | null;
  finance_backfill_from: string | null;
  finance_backfill_to: string | null;
  finance_backfill_strategy: string | null;
  finance_backfill_started_at: string | null;
  finance_backfill_completed_at: string | null;
  finance_backfill_verified_at: string | null;
  finance_backfill_error: string | null;
  finance_backfill_progress: FinanceBackfillProgress;
  schemaAvailable: boolean;
};

export type LifecycleRunResult = {
  marketplaceAccountId: string;
  status: SyncLifecycleStatus | null;
  needsContinue: boolean;
  message: string;
  windowsProcessed: number;
  verified: boolean;
};

export type HistoricalBackfillVerification = {
  ok: boolean;
  pendingWindows: string[];
  failedWindows: string[];
  reason?: string;
};

function windowKey(from: string, to: string): string {
  return `${from}:${to}`;
}

function emptyProgress(
  from: string,
  to: string,
  strategy: "monthly" | "rolling30" | "single"
): FinanceBackfillProgress {
  return {
    completedWindows: {},
    failedWindows: {},
    pendingWindows: buildFinanceBackfillWindows(from, to, strategy).map((w) =>
      windowKey(w.from, w.to)
    ),
    lastWindow: null,
    strategy,
    from,
    to,
  };
}

export function allowsIncrementalFinanceSync(
  status: SyncLifecycleStatus | null | undefined
): boolean {
  // Legacy / migration-missing: do not block existing accounts.
  if (status == null) return true;
  return INCREMENTAL_READY_STATUSES.has(status);
}

export async function getAccountLifecycleState(
  accountId: string
): Promise<AccountLifecycleState | null> {
  const supabase = createAdminClient();
  const full =
    "id, marketplace, sync_enabled, sync_lifecycle_status, finance_backfill_from, finance_backfill_to, finance_backfill_strategy, finance_backfill_started_at, finance_backfill_completed_at, finance_backfill_verified_at, finance_backfill_error, finance_backfill_progress";
  const legacy = "id, marketplace, sync_enabled";

  let { data, error } = await supabase
    .from("marketplace_accounts")
    .select(full)
    .eq("id", accountId)
    .maybeSingle();

  let schemaAvailable = !error;
  if (error) {
    ({ data, error } = await supabase
      .from("marketplace_accounts")
      .select(legacy)
      .eq("id", accountId)
      .maybeSingle());
    schemaAvailable = false;
  }

  if (error) throw new Error(`Failed to load lifecycle state: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    marketplace: row.marketplace as MarketplaceType,
    sync_enabled: Boolean(row.sync_enabled),
    sync_lifecycle_status: (row.sync_lifecycle_status as SyncLifecycleStatus | null) ?? null,
    finance_backfill_from: (row.finance_backfill_from as string | null) ?? null,
    finance_backfill_to: (row.finance_backfill_to as string | null) ?? null,
    finance_backfill_strategy: (row.finance_backfill_strategy as string | null) ?? null,
    finance_backfill_started_at: (row.finance_backfill_started_at as string | null) ?? null,
    finance_backfill_completed_at: (row.finance_backfill_completed_at as string | null) ?? null,
    finance_backfill_verified_at: (row.finance_backfill_verified_at as string | null) ?? null,
    finance_backfill_error: (row.finance_backfill_error as string | null) ?? null,
    finance_backfill_progress: (row.finance_backfill_progress as FinanceBackfillProgress) ?? {},
    schemaAvailable,
  };
}

async function patchLifecycle(
  accountId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("marketplace_accounts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) {
    console.warn("[lifecycle] patch skipped:", error.message);
    return false;
  }
  return true;
}

async function setLifecycleStatus(
  accountId: string,
  status: SyncLifecycleStatus,
  extra: Record<string, unknown> = {}
): Promise<void> {
  await patchLifecycle(accountId, { sync_lifecycle_status: status, ...extra });
}

/**
 * After createMarketplaceAccount: NEW_ACCOUNT + durable backfill range.
 * Non-Wildberries accounts enter ACCOUNT_VERIFICATION (no finance history to backfill).
 */
export async function initializeNewAccountLifecycle(
  accountId: string,
  marketplace: MarketplaceType
): Promise<void> {
  if (marketplace !== "wildberries") {
    await patchLifecycle(accountId, {
      sync_lifecycle_status: "ACCOUNT_VERIFICATION",
      finance_backfill_error: null,
      finance_backfill_progress: {},
      finance_backfill_completed_at: null,
      finance_backfill_verified_at: null,
    });
    syncLog("account-lifecycle", "non-WB account → ACCOUNT_VERIFICATION", {
      accountId,
      marketplace,
    });
    try {
      const { initializeWarehouseFoundationForAccount } = await import(
        "@/services/historical-warehouse-orchestrator"
      );
      await initializeWarehouseFoundationForAccount(accountId);
    } catch {
      /* warehouse migration optional */
    }
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const from = `${today.slice(0, 4)}-01-01`;
  const strategy = "monthly" as const;
  const progress = emptyProgress(from, today, strategy);

  const ok = await patchLifecycle(accountId, {
    sync_lifecycle_status: "NEW_ACCOUNT",
    finance_backfill_from: from,
    finance_backfill_to: today,
    finance_backfill_strategy: strategy,
    finance_backfill_started_at: null,
    finance_backfill_completed_at: null,
    finance_backfill_verified_at: null,
    finance_backfill_error: null,
    finance_backfill_progress: progress,
  });

  if (!ok) {
    syncLog("account-lifecycle", "schema missing — lifecycle init skipped", { accountId });
    return;
  }

  syncLog("account-lifecycle", "NEW_ACCOUNT initialized", { accountId, from, to: today });

  // Sprint 11 — seed Historical Data Warehouse entity matrix (non-fatal if migration pending).
  try {
    const { initializeWarehouseFoundationForAccount } = await import(
      "@/services/historical-warehouse-orchestrator"
    );
    await initializeWarehouseFoundationForAccount(accountId);
  } catch (err) {
    syncLog("account-lifecycle", "warehouse foundation init skipped", {
      accountId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

const lifecycleRunsInFlight = new Set<string>();

function resolveAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

/** Schedule lifecycle runner after the current request (non-blocking). */
export function scheduleAccountLifecycle(accountId: string): void {
  after(async () => {
    try {
      const result = await runNewAccountLifecycle(accountId);
      if (result.needsContinue) {
        const base = resolveAppBaseUrl();
        await fetch(`${base}/api/sync/account-lifecycle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...containmentServerAuthHeader(),
          },
          body: JSON.stringify({ marketplaceAccountId: accountId }),
        }).catch((err) => {
          console.warn(
            "[lifecycle] continue fetch failed:",
            err instanceof Error ? err.message : err
          );
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "lifecycle failed";
      syncLog("account-lifecycle", "schedule failed", { accountId, message });
      await setLifecycleStatus(accountId, "FAILED", { finance_backfill_error: message }).catch(
        () => undefined
      );
    }
  });
}

function progressFromState(state: AccountLifecycleState): FinanceBackfillProgress {
  const from =
    state.finance_backfill_from ??
    state.finance_backfill_progress.from ??
    `${new Date().toISOString().slice(0, 4)}-01-01`;
  const to =
    state.finance_backfill_to ??
    state.finance_backfill_progress.to ??
    new Date().toISOString().slice(0, 10);
  const strategy =
    (state.finance_backfill_strategy as "monthly" | "rolling30" | "single" | null) ??
    state.finance_backfill_progress.strategy ??
    "monthly";

  const base = emptyProgress(from, to, strategy);
  return {
    ...base,
    ...state.finance_backfill_progress,
    completedWindows: {
      ...base.completedWindows,
      ...(state.finance_backfill_progress.completedWindows ?? {}),
    },
    failedWindows: { ...(state.finance_backfill_progress.failedWindows ?? {}) },
    from,
    to,
    strategy,
  };
}

function resumeMap(progress: FinanceBackfillProgress): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const [key, value] of Object.entries(progress.completedWindows ?? {})) {
    if (value) map.set(key, true);
  }
  return map;
}

function recomputePending(progress: FinanceBackfillProgress): string[] {
  const from = progress.from!;
  const to = progress.to!;
  const strategy = progress.strategy ?? "monthly";
  const completed = progress.completedWindows ?? {};
  return buildFinanceBackfillWindows(from, to, strategy)
    .map((w) => windowKey(w.from, w.to))
    .filter((key) => !completed[key]);
}

async function persistProgress(
  accountId: string,
  progress: FinanceBackfillProgress
): Promise<void> {
  const pending = recomputePending(progress);
  await patchLifecycle(accountId, {
    finance_backfill_progress: { ...progress, pendingWindows: pending },
  });
}

export function verifyHistoricalBackfillProgress(
  progress: FinanceBackfillProgress
): HistoricalBackfillVerification {
  const from = progress.from;
  const to = progress.to;
  const strategy = progress.strategy ?? "monthly";
  if (!from || !to) {
    return {
      ok: false,
      pendingWindows: [],
      failedWindows: [],
      reason: "missing_backfill_range",
    };
  }

  const expected = buildFinanceBackfillWindows(from, to, strategy).map((w) =>
    windowKey(w.from, w.to)
  );
  const completed = progress.completedWindows ?? {};
  const failed = Object.keys(progress.failedWindows ?? {});
  const pendingWindows = expected.filter((key) => !completed[key]);

  if (failed.length > 0) {
    return {
      ok: false,
      pendingWindows,
      failedWindows: failed,
      reason: "failed_windows_remain",
    };
  }
  if (pendingWindows.length > 0) {
    return {
      ok: false,
      pendingWindows,
      failedWindows: failed,
      reason: "pending_windows_remain",
    };
  }
  return { ok: true, pendingWindows: [], failedWindows: [] };
}

async function fetchFinanceInRange(
  accountId: string,
  from: string,
  to: string
): Promise<WbFinance[]> {
  const supabase = createAdminClient();
  const rows: WbFinance[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("wb_finance")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as WbFinance[]));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function countFinanceInRange(
  accountId: string,
  from: string,
  to: string
): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("wb_finance")
    .select("*", { count: "exact", head: true })
    .eq("marketplace_account_id", accountId)
    .gte("operation_date", from)
    .lte("operation_date", to);
  if (error) throw new Error(`Finance coverage count failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Build / refresh backfill progress from durable metadata + DB coverage.
 * Windows with finance rows are marked complete; empty windows stay pending.
 */
export async function buildAccountVerificationProgress(
  accountId: string,
  state: AccountLifecycleState
): Promise<FinanceBackfillProgress> {
  const today = new Date().toISOString().slice(0, 10);
  const from =
    state.finance_backfill_from ??
    state.finance_backfill_progress.from ??
    `${today.slice(0, 4)}-01-01`;
  const to = state.finance_backfill_to ?? state.finance_backfill_progress.to ?? today;
  const strategy =
    (state.finance_backfill_strategy as "monthly" | "rolling30" | "single" | null) ??
    state.finance_backfill_progress.strategy ??
    "monthly";

  const progress: FinanceBackfillProgress = {
    ...emptyProgress(from, to, strategy),
    completedWindows: { ...(state.finance_backfill_progress.completedWindows ?? {}) },
    failedWindows: { ...(state.finance_backfill_progress.failedWindows ?? {}) },
    from,
    to,
    strategy,
  };

  const windows = buildFinanceBackfillWindows(from, to, strategy);
  for (const window of windows) {
    const key = windowKey(window.from, window.to);
    if (progress.completedWindows?.[key]) continue;
    if (progress.failedWindows?.[key]) continue;
    const rows = await countFinanceInRange(accountId, window.from, window.to);
    if (rows > 0) {
      progress.completedWindows = { ...(progress.completedWindows ?? {}), [key]: true };
    }
  }
  progress.pendingWindows = recomputePending(progress);
  return progress;
}

export type AccountVerificationResult = {
  ok: boolean;
  nextStatus: SyncLifecycleStatus;
  reason: string;
  progress: FinanceBackfillProgress;
};

/**
 * Single authority that may promote an account toward HEALTHY.
 * Does not call Wildberries APIs — metadata + DB coverage only.
 */
export function evaluateAccountVerification(
  progress: FinanceBackfillProgress,
  options?: { marketplace?: MarketplaceType }
): AccountVerificationResult {
  if (options?.marketplace && options.marketplace !== "wildberries") {
    return {
      ok: true,
      nextStatus: "INCREMENTAL_SYNC_ACTIVE",
      reason: "non_wb_no_finance_history_required",
      progress,
    };
  }

  if (!progress.from || !progress.to || progress.from > progress.to) {
    return {
      ok: false,
      nextStatus: "FAILED",
      reason: "invalid_backfill_range",
      progress,
    };
  }

  const strategy = progress.strategy ?? "monthly";
  if (strategy !== "monthly" && strategy !== "rolling30" && strategy !== "single") {
    return {
      ok: false,
      nextStatus: "FAILED",
      reason: "invalid_backfill_strategy",
      progress,
    };
  }

  const verification = verifyHistoricalBackfillProgress(progress);
  if (!verification.ok) {
    const nextStatus: SyncLifecycleStatus =
      verification.failedWindows.length > 0 ? "FAILED" : "PARTIAL";
    return {
      ok: false,
      nextStatus,
      reason: verification.reason ?? "verification_failed",
      progress: {
        ...progress,
        pendingWindows: verification.pendingWindows,
      },
    };
  }

  return {
    ok: true,
    nextStatus: "INCREMENTAL_SYNC_ACTIVE",
    reason: "verification_passed",
    progress,
  };
}

async function promoteVerifiedToHealthy(accountId: string): Promise<void> {
  const now = new Date().toISOString();
  await setLifecycleStatus(accountId, "INCREMENTAL_SYNC_ACTIVE", {
    finance_backfill_error: null,
  });
  await setLifecycleStatus(accountId, "HEALTHY", {
    finance_backfill_verified_at: now,
    finance_backfill_completed_at: now,
    finance_backfill_error: null,
  });
  syncLog("account-lifecycle", "Verification passed → INCREMENTAL_SYNC_ACTIVE → HEALTHY", {
    accountId,
  });
  try {
    const { mirrorFinanceEntityFromLifecycle } = await import(
      "@/services/historical-warehouse-orchestrator"
    );
    await mirrorFinanceEntityFromLifecycle(accountId);
  } catch {
    /* warehouse tables optional until Sprint 11 migration applied */
  }
}

async function runAccountVerificationPhase(
  accountId: string,
  state: AccountLifecycleState
): Promise<LifecycleRunResult> {
  syncLog("account-lifecycle", "ACCOUNT_VERIFICATION start", { accountId });

  const progress = await buildAccountVerificationProgress(accountId, state);
  await patchLifecycle(accountId, {
    finance_backfill_from: progress.from,
    finance_backfill_to: progress.to,
    finance_backfill_strategy: progress.strategy,
    finance_backfill_progress: progress,
  });

  const result = evaluateAccountVerification(progress, {
    marketplace: state.marketplace,
  });

  if (!result.ok) {
    await setLifecycleStatus(accountId, result.nextStatus, {
      finance_backfill_error: result.reason,
      finance_backfill_progress: result.progress,
      finance_backfill_verified_at: null,
    });
    return {
      marketplaceAccountId: accountId,
      status: result.nextStatus,
      needsContinue: false,
      message: result.reason,
      windowsProcessed: 0,
      verified: false,
    };
  }

  await promoteVerifiedToHealthy(accountId);
  return {
    marketplaceAccountId: accountId,
    status: "HEALTHY",
    needsContinue: false,
    message: result.reason,
    windowsProcessed: 0,
    verified: true,
  };
}

async function activateIncrementalSync(accountId: string): Promise<void> {
  const now = new Date().toISOString();
  await setLifecycleStatus(accountId, "HISTORICAL_BACKFILL_COMPLETE", {
    finance_backfill_completed_at: now,
    finance_backfill_error: null,
  });
  await promoteVerifiedToHealthy(accountId);
}

/**
 * Drive the lifecycle until blocked, failed, or healthy.
 * Safe to call repeatedly (idempotent resume — never restarts completed windows).
 */
export async function runNewAccountLifecycle(
  accountId: string,
  options?: { maxWindowsPerInvocation?: number; reentrant?: boolean }
): Promise<LifecycleRunResult> {
  const maxWindows = options?.maxWindowsPerInvocation ?? 3;
  const reentrant = options?.reentrant === true;
  const acquired = reentrant ? false : !lifecycleRunsInFlight.has(accountId);

  if (!reentrant && lifecycleRunsInFlight.has(accountId)) {
    return {
      marketplaceAccountId: accountId,
      status: null,
      needsContinue: false,
      message: "already_in_flight",
      windowsProcessed: 0,
      verified: false,
    };
  }
  if (acquired) lifecycleRunsInFlight.add(accountId);

  try {
    return await runNewAccountLifecycleBody(accountId, maxWindows);
  } finally {
    if (acquired) lifecycleRunsInFlight.delete(accountId);
  }
}

async function runNewAccountLifecycleBody(
  accountId: string,
  maxWindows: number
): Promise<LifecycleRunResult> {
  const state = await getAccountLifecycleState(accountId);
  if (!state) {
    return {
      marketplaceAccountId: accountId,
      status: null,
      needsContinue: false,
      message: "account_not_found",
      windowsProcessed: 0,
      verified: false,
    };
  }

  if (!state.schemaAvailable) {
    return {
      marketplaceAccountId: accountId,
      status: null,
      needsContinue: false,
      message: "lifecycle_schema_missing",
      windowsProcessed: 0,
      verified: false,
    };
  }

  if (!state.sync_enabled) {
    return {
      marketplaceAccountId: accountId,
      status: state.sync_lifecycle_status,
      needsContinue: false,
      message: "sync_disabled",
      windowsProcessed: 0,
      verified: false,
    };
  }

  let status = state.sync_lifecycle_status;

  if (status === "HEALTHY" || status === "INCREMENTAL_SYNC_ACTIVE") {
    return {
      marketplaceAccountId: accountId,
      status,
      needsContinue: false,
      message: "already_ready",
      windowsProcessed: 0,
      verified: true,
    };
  }

  if (status === "FAILED" || status === "PARTIAL") {
    return {
      marketplaceAccountId: accountId,
      status,
      needsContinue: false,
      message: "terminal_failure — incremental not activated",
      windowsProcessed: 0,
      verified: false,
    };
  }

  if (status === "RECOVERING") {
    return {
      marketplaceAccountId: accountId,
      status,
      needsContinue: false,
      message: "recovering_reserved",
      windowsProcessed: 0,
      verified: false,
    };
  }

  if (status === "ACCOUNT_VERIFICATION") {
    return runAccountVerificationPhase(accountId, state);
  }

  if (state.marketplace !== "wildberries") {
    // Non-WB without verification status — enter verification (does not invent HEALTHY).
    await setLifecycleStatus(accountId, "ACCOUNT_VERIFICATION", {
      finance_backfill_verified_at: null,
    });
    return runAccountVerificationPhase(accountId, {
      ...state,
      sync_lifecycle_status: "ACCOUNT_VERIFICATION",
    });
  }

  if (status === "HISTORICAL_BACKFILL_COMPLETE") {
    await activateIncrementalSync(accountId);
    return {
      marketplaceAccountId: accountId,
      status: "HEALTHY",
      needsContinue: false,
      message: "activated_from_complete",
      windowsProcessed: 0,
      verified: true,
    };
  }

  if (status === "HISTORICAL_BACKFILL_VERIFYING") {
    const progress = progressFromState(state);
    const verification = verifyHistoricalBackfillProgress(progress);
    if (!verification.ok) {
      const next: SyncLifecycleStatus =
        verification.failedWindows.length > 0 ? "FAILED" : "PARTIAL";
      await setLifecycleStatus(accountId, next, {
        finance_backfill_error: verification.reason ?? "verification_failed",
        finance_backfill_progress: {
          ...progress,
          pendingWindows: verification.pendingWindows,
        },
      });
      await markAccountSyncFinished(accountId, "failed").catch(() => undefined);
      return {
        marketplaceAccountId: accountId,
        status: next,
        needsContinue: false,
        message: verification.reason ?? "verification_failed",
        windowsProcessed: 0,
        verified: false,
      };
    }
    await activateIncrementalSync(accountId);
    await markAccountSyncFinished(accountId, "success").catch(() => undefined);
    return {
      marketplaceAccountId: accountId,
      status: "HEALTHY",
      needsContinue: false,
      message: "verified_and_activated",
      windowsProcessed: 0,
      verified: true,
    };
  }

  const progress = progressFromState(state);
  const from = progress.from!;
  const to = progress.to!;
  const strategy = progress.strategy ?? "monthly";

  if (status === "NEW_ACCOUNT" || status == null) {
    await setLifecycleStatus(accountId, "HISTORICAL_BACKFILL_RUNNING", {
      finance_backfill_from: from,
      finance_backfill_to: to,
      finance_backfill_strategy: strategy,
      finance_backfill_started_at: new Date().toISOString(),
      finance_backfill_error: null,
      finance_backfill_progress: progress,
    });
    status = "HISTORICAL_BACKFILL_RUNNING";
  }

  await markAccountSyncStarted(accountId).catch(() => undefined);

  const pending = recomputePending(progress);
  if (pending.length === 0 && Object.keys(progress.failedWindows ?? {}).length === 0) {
    await setLifecycleStatus(accountId, "HISTORICAL_BACKFILL_VERIFYING", {
      finance_backfill_progress: progress,
    });
    return runNewAccountLifecycle(accountId, { maxWindowsPerInvocation: maxWindows, reentrant: true });
  }

  if (Object.keys(progress.failedWindows ?? {}).length > 0 && pending.length === 0) {
    await setLifecycleStatus(accountId, "FAILED", {
      finance_backfill_error: "failed_windows_remain",
      finance_backfill_progress: progress,
    });
    await markAccountSyncFinished(accountId, "failed").catch(() => undefined);
    return {
      marketplaceAccountId: accountId,
      status: "FAILED",
      needsContinue: false,
      message: "failed_windows_remain",
      windowsProcessed: 0,
      verified: false,
    };
  }

  // Process only the next N pending windows; other pending are skipped this invocation
  // without being persisted as completed.
  const budgetKeys = pending.slice(0, maxWindows);
  const budgetSet = new Set(budgetKeys);
  const skipMap = resumeMap(progress);
  for (const key of pending) {
    if (!budgetSet.has(key)) skipMap.set(key, true);
  }

  syncLog("account-lifecycle", "HISTORICAL_BACKFILL_RUNNING", {
    accountId,
    budget: budgetKeys,
    pendingTotal: pending.length,
  });

  const syncService = await createWbSyncService(accountId);
  let windowsProcessed = 0;

  const backfillResult = await runFinanceHistoryBackfill(syncService, {
    from,
    to,
    strategy,
    resumeFromProgress: skipMap,
    skipCompletedWindows: true,
    pauseBetweenWindowsMs: 30_000,
    fetchFinanceInRange: (f, t) => fetchFinanceInRange(accountId, f, t),
    onPeriodComplete: async (period) => {
      if (period.skipped) return;
      const key = windowKey(period.window.from, period.window.to);
      if (!budgetSet.has(key)) return;

      if (hasFatalSyncErrors(period.errors)) {
        progress.failedWindows = {
          ...(progress.failedWindows ?? {}),
          [key]: period.errors.join("; "),
        };
      } else {
        progress.completedWindows = { ...(progress.completedWindows ?? {}), [key]: true };
        if (progress.failedWindows?.[key]) delete progress.failedWindows[key];
      }
      progress.lastWindow = key;
      progress.pendingWindows = recomputePending(progress);
      await persistProgress(accountId, progress);
      await touchAccountSyncHeartbeat(accountId).catch(() => undefined);
      windowsProcessed += 1;
    },
  });

  if (!backfillResult.completed && backfillResult.stoppedAt) {
    const anyCompleted = Object.keys(progress.completedWindows ?? {}).length > 0;
    const next: SyncLifecycleStatus = anyCompleted ? "PARTIAL" : "FAILED";
    await setLifecycleStatus(accountId, next, {
      finance_backfill_error: `stopped_at:${backfillResult.stoppedAt}`,
      finance_backfill_progress: progress,
    });
    await markAccountSyncFinished(accountId, "failed").catch(() => undefined);
    return {
      marketplaceAccountId: accountId,
      status: next,
      needsContinue: false,
      message: `historical_backfill_stopped:${backfillResult.stoppedAt}`,
      windowsProcessed,
      verified: false,
    };
  }

  const remaining = recomputePending(progress);
  const failedCount = Object.keys(progress.failedWindows ?? {}).length;

  if (failedCount > 0 && remaining.length === 0) {
    await setLifecycleStatus(accountId, "FAILED", {
      finance_backfill_error: "failed_windows_remain",
      finance_backfill_progress: progress,
    });
    await markAccountSyncFinished(accountId, "failed").catch(() => undefined);
    return {
      marketplaceAccountId: accountId,
      status: "FAILED",
      needsContinue: false,
      message: "failed_windows_remain",
      windowsProcessed,
      verified: false,
    };
  }

  if (remaining.length > 0) {
    await setLifecycleStatus(accountId, "HISTORICAL_BACKFILL_RUNNING", {
      finance_backfill_progress: progress,
    });
    return {
      marketplaceAccountId: accountId,
      status: "HISTORICAL_BACKFILL_RUNNING",
      needsContinue: true,
      message: `continue_pending:${remaining.length}`,
      windowsProcessed,
      verified: false,
    };
  }

  await setLifecycleStatus(accountId, "HISTORICAL_BACKFILL_VERIFYING", {
    finance_backfill_progress: progress,
  });

  const verification = verifyHistoricalBackfillProgress(progress);
  if (!verification.ok) {
    const next: SyncLifecycleStatus =
      verification.failedWindows.length > 0 ? "FAILED" : "PARTIAL";
    await setLifecycleStatus(accountId, next, {
      finance_backfill_error: verification.reason ?? "verification_failed",
    });
    await markAccountSyncFinished(accountId, "failed").catch(() => undefined);
    return {
      marketplaceAccountId: accountId,
      status: next,
      needsContinue: false,
      message: verification.reason ?? "verification_failed",
      windowsProcessed,
      verified: false,
    };
  }

  await activateIncrementalSync(accountId);
  await markAccountSyncFinished(accountId, "success").catch(() => undefined);

  return {
    marketplaceAccountId: accountId,
    status: "HEALTHY",
    needsContinue: false,
    message: "historical_backfill_complete_incremental_active",
    windowsProcessed,
    verified: true,
  };
}

/**
 * Resume interrupted historical backfill after stale lock release.
 * Does not retry FAILED/PARTIAL. Skips if a run is already in-flight in-process.
 */
export async function resumeAccountLifecycleIfNeeded(
  accountId: string
): Promise<LifecycleRunResult | null> {
  if (lifecycleRunsInFlight.has(accountId)) return null;

  const state = await getAccountLifecycleState(accountId);
  if (!state?.schemaAvailable) return null;

  const status = state.sync_lifecycle_status;
  if (
    status === "NEW_ACCOUNT" ||
    status === "ACCOUNT_VERIFICATION" ||
    status === "HISTORICAL_BACKFILL_RUNNING" ||
    status === "HISTORICAL_BACKFILL_VERIFYING" ||
    status === "HISTORICAL_BACKFILL_COMPLETE"
  ) {
    scheduleAccountLifecycle(accountId);
    return {
      marketplaceAccountId: accountId,
      status,
      needsContinue: true,
      message: "resume_scheduled",
      windowsProcessed: 0,
      verified: false,
    };
  }
  return null;
}
