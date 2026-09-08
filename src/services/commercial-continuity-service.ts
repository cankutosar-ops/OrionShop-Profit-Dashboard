/**
 * Commercial Data Continuity orchestrator.
 *
 * Durable scheduled sync for Orders / Sales / Finance using existing
 * executeDashboardSync / WbSyncService / Finance Sync V2.
 * Does NOT own Financial Engine formulas or Warehouse/Inventory continuity.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { filterOperationalMarketplaceAccounts } from "@/lib/marketplace-account-visibility";
import {
  classifyCommercialError,
  sanitizeCommercialError,
} from "@/lib/commercial-continuity/classify";
import {
  markCommercialEntityRunning,
  persistCommercialEntityOutcome,
  resolveFinanceExternalDelay,
} from "@/lib/commercial-continuity/persist-outcome";
import {
  COMMERCIAL_SYNC_ENTITIES,
  DEFAULT_COMMERCIAL_MAX_LOOKBACK_DAYS,
  DEFAULT_COMMERCIAL_SYNC_INTERVAL_MINUTES,
  type AccountCommercialContinuityResult,
  type CommercialContinuityTickResult,
  type CommercialEntityFreshnessView,
  type CommercialEntityStatus,
  type CommercialSyncEntity,
  type CommercialSyncTrigger,
} from "@/lib/commercial-continuity/types";
import {
  daysBetweenIso,
  resolveCommercialSyncWindow,
  todayUtcDate,
} from "@/lib/commercial-continuity/window";
import { FRESHNESS_CRITICAL_DAYS, FRESHNESS_WARN_DAYS } from "@/lib/production-health/score";
import { getPlatformConfiguration, isFeatureEnabled } from "@/lib/platform-config/provider";
import { syncLog } from "@/lib/wildberries/sync-log";
import {
  listCommercialEntityStates,
  readLatestDataDateFromDb,
} from "@/services/commercial-entity-sync-state-service";
import {
  assertSyncNotRunning,
  runBlockingDashboardSync,
  SyncAlreadyRunningError,
} from "@/services/sync-job-service";
import type { MarketplaceAccountPublic } from "@/types/database";

function isMissingRelation(message: string): boolean {
  return /does not exist|schema cache|Could not find/i.test(message);
}

async function createTick(trigger: CommercialSyncTrigger): Promise<string | null> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("commercial_sync_ticks")
    .insert({ trigger, started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) {
    if (!isMissingRelation(error.message)) {
      console.warn("[commercial-continuity] tick create failed:", error.message);
    }
    return null;
  }
  return data?.id ? String(data.id) : null;
}

async function finishTick(
  tickId: string | null,
  summary: Omit<CommercialContinuityTickResult, "tickId" | "trigger" | "startedAt" | "finishedAt" | "results"> & {
    results: AccountCommercialContinuityResult[];
    error?: string | null;
  }
): Promise<void> {
  if (!tickId) return;
  const sb = createAdminClient();
  await sb
    .from("commercial_sync_ticks")
    .update({
      finished_at: new Date().toISOString(),
      accounts_considered: summary.accountsConsidered,
      accounts_synced: summary.accountsSynced,
      accounts_skipped: summary.accountsSkipped,
      accounts_failed: summary.accountsFailed,
      summary: { results: summary.results },
      error: summary.error ?? null,
    })
    .eq("id", tickId);
}

export async function listEligibleCommercialAccounts(): Promise<
  Array<Pick<MarketplaceAccountPublic, "id" | "account_name" | "is_active" | "sync_enabled">>
> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("marketplace_accounts")
    .select("id, account_name, is_active, sync_enabled")
    .eq("is_active", true)
    .eq("sync_enabled", true)
    .order("id");

  if (error) {
    throw new Error(`Failed to list marketplace accounts: ${error.message}`);
  }

  const rows = (data ?? []).map((r) => ({
    id: String(r.id),
    account_name: String(r.account_name),
    is_active: !!r.is_active,
    sync_enabled: r.sync_enabled !== false,
  }));

  return filterOperationalMarketplaceAccounts(rows).filter((a) => a.sync_enabled !== false);
}

export async function resolveCommercialSyncIntervalMinutes(): Promise<number> {
  try {
    const config = await getPlatformConfiguration();
    const raw = (config.systemPreferences as { commercialSyncIntervalMinutes?: number })
      .commercialSyncIntervalMinutes;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 15) {
      return Math.min(24 * 60, Math.floor(raw));
    }
  } catch {
    // defaults
  }
  return DEFAULT_COMMERCIAL_SYNC_INTERVAL_MINUTES;
}

export async function resolveCommercialMaxLookbackDays(): Promise<number> {
  try {
    const config = await getPlatformConfiguration();
    const raw = (config.systemPreferences as { commercialSyncMaxLookbackDays?: number })
      .commercialSyncMaxLookbackDays;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
      return Math.min(90, Math.floor(raw));
    }
  } catch {
    // defaults
  }
  return DEFAULT_COMMERCIAL_MAX_LOOKBACK_DAYS;
}

function entityDue(
  lastExecutionAt: string | null,
  status: CommercialEntityStatus,
  nextRetryAt: string | null,
  intervalMinutes: number,
  now: Date
): boolean {
  if (status === "running") return false;
  if (status === "permission_denied" || status === "blocked") return false;
  if (nextRetryAt) {
    return Date.parse(nextRetryAt) <= now.getTime();
  }
  if (!lastExecutionAt) return true;
  const elapsedMs = now.getTime() - Date.parse(lastExecutionAt);
  return elapsedMs >= intervalMinutes * 60_000;
}

function freshnessLabelFor(
  entity: CommercialSyncEntity,
  status: CommercialEntityStatus,
  daysBehind: number | null
): CommercialEntityFreshnessView["freshnessLabel"] {
  if (status === "rate_limited") return "rate_limited";
  if (status === "permission_denied" || status === "blocked") return "blocked";
  if (status === "external_delay") return "external_delay";
  if (daysBehind == null) return "unknown";
  if (daysBehind > FRESHNESS_CRITICAL_DAYS[entity]) return "critical";
  if (daysBehind > FRESHNESS_WARN_DAYS[entity]) return "delayed";
  return "current";
}

export async function getAccountCommercialFreshness(
  marketplaceAccountId: string
): Promise<CommercialEntityFreshnessView[]> {
  const states = await listCommercialEntityStates(marketplaceAccountId);
  const expected = todayUtcDate();
  const views: CommercialEntityFreshnessView[] = [];

  for (const entity of COMMERCIAL_SYNC_ENTITIES) {
    const row = states.find((s) => s.entity === entity);
    const latestFromDb = await readLatestDataDateFromDb(marketplaceAccountId, entity);
    const latestDataDate = latestFromDb ?? row?.latest_data_date ?? null;
    const daysBehind = daysBetweenIso(latestDataDate, expected);
    const status = (row?.status ?? "idle") as CommercialEntityStatus;
    views.push({
      entity,
      lastExecutionAt: row?.last_execution_at ?? null,
      lastSuccessfulExecutionAt: row?.last_successful_execution_at ?? null,
      latestDataDate,
      status,
      failureClass: row?.failure_class ?? null,
      lastError: row?.last_error ?? null,
      retryCount: row?.retry_count ?? 0,
      nextRetryAt: row?.next_retry_at ?? null,
      daysBehindExpected: daysBehind,
      freshnessLabel: freshnessLabelFor(entity, status, daysBehind),
    });
  }
  return views;
}

async function syncOneEntity(input: {
  marketplaceAccountId: string;
  entity: CommercialSyncEntity;
  dateFrom: string;
  dateTo: string;
  trigger: CommercialSyncTrigger;
  priorRetryCount: number;
}): Promise<{
  status: CommercialEntityStatus;
  error: string | null;
  latestDataDate: string | null;
  rowsUpserted: number;
}> {
  const syncTrigger =
    input.trigger === "scheduled" || input.trigger === "api"
      ? "auto"
      : input.trigger === "recover"
        ? "recover"
        : "manual";

  await markCommercialEntityRunning({
    marketplaceAccountId: input.marketplaceAccountId,
    entity: input.entity,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  });

  try {
    const result = await runBlockingDashboardSync(
      {
        marketplaceAccountId: input.marketplaceAccountId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        entities: [input.entity],
        trigger: syncTrigger,
      },
      { commercialBounded: true, skipCommercialStateRecord: true }
    );

    const entityResult = result.results.find((r) => r.entity === input.entity);
    const errors = entityResult?.errors ?? [];
    const errorText = errors.find((e) => !String(e).startsWith("warning:")) ?? null;
    const rowsUpserted =
      (entityResult?.recordsInserted ?? 0) + (entityResult?.recordsUpdated ?? 0);
    const latestDataDate = await readLatestDataDateFromDb(
      input.marketplaceAccountId,
      input.entity
    );

    if (errorText) {
      const classified = classifyCommercialError(String(errorText));
      return {
        status: classified.status,
        error: sanitizeCommercialError(String(errorText)),
        latestDataDate,
        rowsUpserted,
      };
    }

    const externalDelay = resolveFinanceExternalDelay({
      entity: input.entity,
      rowsUpserted,
      latestDataDate,
      dateTo: input.dateTo,
      errorText,
    });
    if (externalDelay) {
      return {
        status: externalDelay.status,
        error: externalDelay.error,
        latestDataDate,
        rowsUpserted,
      };
    }

    if (result.lastSyncStatus === "partial" || result.lastSyncStatus === "warning") {
      return {
        status: result.lastSyncStatus === "warning" ? "warning" : "partial",
        error: null,
        latestDataDate,
        rowsUpserted,
      };
    }

    return {
      status: "success",
      error: null,
      latestDataDate,
      rowsUpserted,
    };
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) {
      return {
        status: "blocked",
        error: sanitizeCommercialError(err.message),
        latestDataDate: await readLatestDataDateFromDb(input.marketplaceAccountId, input.entity),
        rowsUpserted: 0,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    const classified = classifyCommercialError(message);
    return {
      status: classified.status,
      error: sanitizeCommercialError(message),
      latestDataDate: await readLatestDataDateFromDb(input.marketplaceAccountId, input.entity),
      rowsUpserted: 0,
    };
  }
}

async function persistEntityOutcome(input: {
  marketplaceAccountId: string;
  entity: CommercialSyncEntity;
  status: CommercialEntityStatus;
  error: string | null;
  latestDataDate: string | null;
  rowsUpserted: number;
  dateFrom: string;
  dateTo: string;
  priorRetryCount: number;
}): Promise<void> {
  await persistCommercialEntityOutcome({
    marketplaceAccountId: input.marketplaceAccountId,
    entity: input.entity,
    status: input.status,
    error: input.error,
    latestDataDate: input.latestDataDate,
    rowsUpserted: input.rowsUpserted,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    priorRetryCount: input.priorRetryCount,
  });
}

export async function runCommercialContinuityForAccount(input: {
  marketplaceAccountId: string;
  accountName: string;
  trigger: CommercialSyncTrigger;
  intervalMinutes: number;
  maxLookbackDays: number;
  force?: boolean;
  deadlineMs?: number;
}): Promise<AccountCommercialContinuityResult> {
  const now = new Date();
  const entityResults: AccountCommercialContinuityResult["entities"] = [];
  const budgetExhausted = () =>
    input.deadlineMs != null && Date.now() >= input.deadlineMs;

  try {
    await assertSyncNotRunning(input.marketplaceAccountId);
  } catch (err) {
    if (err instanceof SyncAlreadyRunningError) {
      return {
        marketplaceAccountId: input.marketplaceAccountId,
        accountName: input.accountName,
        skipped: true,
        skipReason: "sync_already_running",
        entities: [],
      };
    }
    throw err;
  }

  const states = await listCommercialEntityStates(input.marketplaceAccountId);

  for (const entity of COMMERCIAL_SYNC_ENTITIES) {
    if (budgetExhausted()) {
      entityResults.push({
        entity,
        status: (states.find((s) => s.entity === entity)?.status as CommercialEntityStatus) ?? "idle",
        latestDataDate: states.find((s) => s.entity === entity)?.latest_data_date ?? null,
        error: "skipped_budget_exhausted",
      });
      continue;
    }

    const prior = states.find((s) => s.entity === entity);
    const due =
      input.force ||
      entityDue(
        prior?.last_execution_at ?? null,
        (prior?.status as CommercialEntityStatus) ?? "idle",
        prior?.next_retry_at ?? null,
        input.intervalMinutes,
        now
      );

    if (!due) {
      entityResults.push({
        entity,
        status: (prior?.status as CommercialEntityStatus) ?? "idle",
        latestDataDate: prior?.latest_data_date ?? null,
        error: "skipped_not_due",
      });
      continue;
    }

    if (entity === "finance") {
      const { isFinanceHistoricalRecoveryActive } = await import(
        "@/lib/finance-recovery/coordination"
      );
      if (isFinanceHistoricalRecoveryActive(input.marketplaceAccountId)) {
        entityResults.push({
          entity,
          status: (prior?.status as CommercialEntityStatus) ?? "idle",
          latestDataDate: prior?.latest_data_date ?? null,
          error: "skipped_finance_recovery_active",
        });
        syncLog("commercial-continuity", "ENTITY SKIP finance recovery active", {
          marketplaceAccountId: input.marketplaceAccountId,
        });
        continue;
      }
    }

    const latestDataDate =
      (await readLatestDataDateFromDb(input.marketplaceAccountId, entity)) ??
      prior?.latest_data_date ??
      null;

    const window = resolveCommercialSyncWindow({
      latestDataDate,
      maxLookbackDays: input.maxLookbackDays,
      now,
    });

    syncLog("commercial-continuity", "ENTITY START", {
      marketplaceAccountId: input.marketplaceAccountId,
      entity,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      recoveringGap: window.recoveringGap,
      trigger: input.trigger,
    });

    const outcome = await syncOneEntity({
      marketplaceAccountId: input.marketplaceAccountId,
      entity,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      trigger: input.trigger,
      priorRetryCount: prior?.retry_count ?? 0,
    });

    await persistEntityOutcome({
      marketplaceAccountId: input.marketplaceAccountId,
      entity,
      status: outcome.status,
      error: outcome.error,
      latestDataDate: outcome.latestDataDate,
      rowsUpserted: outcome.rowsUpserted,
      dateFrom: window.dateFrom,
      dateTo: window.dateTo,
      priorRetryCount: prior?.retry_count ?? 0,
    });

    entityResults.push({
      entity,
      status: outcome.status,
      latestDataDate: outcome.latestDataDate,
      error: outcome.error,
    });
  }

  const failed = entityResults.some((e) =>
    ["failed", "rate_limited", "permission_denied", "external_unavailable"].includes(e.status)
  );

  return {
    marketplaceAccountId: input.marketplaceAccountId,
    accountName: input.accountName,
    skipped: false,
    entities: entityResults,
    ...(failed ? {} : {}),
  };
}

/**
 * Full durable tick — iterates all eligible accounts with isolation.
 */
export async function runCommercialContinuityTick(input?: {
  trigger?: CommercialSyncTrigger;
  force?: boolean;
  marketplaceAccountId?: string;
  executionBudgetMs?: number;
}): Promise<CommercialContinuityTickResult> {
  const trigger = input?.trigger ?? "scheduled";
  const startedAt = new Date().toISOString();
  const deadlineMs =
    input?.executionBudgetMs != null
      ? Date.now() + input.executionBudgetMs
      : undefined;

  const { releaseStaleSyncRunsIfNeeded } = await import("@/services/sync-run-service");
  const { releaseStaleCommercialEntityRunningIfNeeded } = await import(
    "@/lib/commercial-continuity/persist-outcome"
  );
  await releaseStaleSyncRunsIfNeeded().catch(() => undefined);
  await releaseStaleCommercialEntityRunningIfNeeded().catch(() => undefined);

  const enabled = await isFeatureEnabled("commercial_data_continuity").catch(() => true);
  // Default ON when flag missing from store (normalize merges defaults — flag added below).
  if (!enabled) {
    return {
      tickId: null,
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      accountsConsidered: 0,
      accountsSynced: 0,
      accountsSkipped: 0,
      accountsFailed: 0,
      results: [],
    };
  }

  const intervalMinutes = await resolveCommercialSyncIntervalMinutes();
  const maxLookbackDays = await resolveCommercialMaxLookbackDays();
  const tickId = await createTick(trigger);

  let accounts = await listEligibleCommercialAccounts();
  if (input?.marketplaceAccountId) {
    accounts = accounts.filter((a) => a.id === String(input.marketplaceAccountId));
  }

  const results: AccountCommercialContinuityResult[] = [];
  let accountsSynced = 0;
  let accountsSkipped = 0;
  let accountsFailed = 0;

  for (const account of accounts) {
    if (deadlineMs != null && Date.now() >= deadlineMs) {
      syncLog("commercial-continuity", "TICK budget exhausted — stopping account loop");
      break;
    }
    try {
      const result = await runCommercialContinuityForAccount({
        marketplaceAccountId: account.id,
        accountName: account.account_name,
        trigger,
        intervalMinutes,
        maxLookbackDays,
        force: input?.force,
        deadlineMs,
      });
      results.push(result);
      if (result.skipped) {
        accountsSkipped += 1;
        continue;
      }
      const hardFail = result.entities.some((e) =>
        ["failed", "rate_limited", "permission_denied", "external_unavailable"].includes(
          e.status
        )
      );
      if (hardFail) accountsFailed += 1;
      else accountsSynced += 1;
    } catch (err) {
      accountsFailed += 1;
      results.push({
        marketplaceAccountId: account.id,
        accountName: account.account_name,
        skipped: false,
        entities: [],
        skipReason: sanitizeCommercialError(
          err instanceof Error ? err.message : "account tick failed"
        ) ?? "account_tick_failed",
      });
      syncLog("commercial-continuity", "ACCOUNT FAILED (isolated)", {
        marketplaceAccountId: account.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const finishedAt = new Date().toISOString();
  await finishTick(tickId, {
    accountsConsidered: accounts.length,
    accountsSynced,
    accountsSkipped,
    accountsFailed,
    results,
  });

  return {
    tickId,
    trigger,
    startedAt,
    finishedAt,
    accountsConsidered: accounts.length,
    accountsSynced,
    accountsSkipped,
    accountsFailed,
    results,
  };
}
