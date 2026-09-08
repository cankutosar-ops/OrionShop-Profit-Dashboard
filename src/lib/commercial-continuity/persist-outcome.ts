/**
 * Shared commercial entity outcome persistence (orchestrator + cleanup paths).
 */

import {
  classifyCommercialError,
  computeNextRetryAtPreferServer,
  sanitizeCommercialError,
} from "@/lib/commercial-continuity/classify";
import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";
import {
  COMMERCIAL_RETRY_POLICY,
  FINANCE_EXTERNAL_DELAY_WARN_DAYS,
  type CommercialEntityStatus,
  type CommercialSyncEntity,
} from "@/lib/commercial-continuity/types";
import { daysBetweenIso } from "@/lib/commercial-continuity/window";
import {
  readLatestDataDateFromDb,
  upsertCommercialEntityState,
} from "@/services/commercial-entity-sync-state-service";

export async function markCommercialEntityRunning(input: {
  marketplaceAccountId: string;
  entity: CommercialSyncEntity;
  dateFrom: string;
  dateTo: string;
}): Promise<void> {
  const latestDataDate = await readLatestDataDateFromDb(input.marketplaceAccountId, input.entity);
  await upsertCommercialEntityState({
    marketplaceAccountId: input.marketplaceAccountId,
    entity: input.entity,
    status: "running",
    latestDataDate,
    lastRequestedFrom: input.dateFrom,
    lastRequestedTo: input.dateTo,
    markSuccessfulExecution: false,
  });
}

export async function persistCommercialEntityOutcome(input: {
  marketplaceAccountId: string;
  entity: CommercialSyncEntity;
  status: CommercialEntityStatus;
  error: string | null;
  latestDataDate?: string | null;
  rowsUpserted?: number;
  dateFrom: string;
  dateTo: string;
  priorRetryCount: number;
  bumpRetry?: boolean;
}): Promise<void> {
  const latestDataDate =
    input.latestDataDate !== undefined
      ? input.latestDataDate
      : await readLatestDataDateFromDb(input.marketplaceAccountId, input.entity);

  const noRetry = COMMERCIAL_RETRY_POLICY.noRetryStatuses.includes(input.status);
  const needsRetry =
    input.bumpRetry !== undefined
      ? input.bumpRetry
      : !noRetry &&
        (input.status === "rate_limited" ||
          input.status === "failed" ||
          input.status === "partial" ||
          input.status === "external_unavailable");

  const nextRetry =
    needsRetry && input.priorRetryCount < COMMERCIAL_RETRY_POLICY.maxAttempts
      ? computeNextRetryAtPreferServer({
          retryCount: input.priorRetryCount,
          baseDelaySeconds: COMMERCIAL_RETRY_POLICY.baseDelaySeconds,
          maxDelaySeconds: COMMERCIAL_RETRY_POLICY.maxDelaySeconds,
          serverRetryAfterMs: getSyncExecutionContext()?.lastRateLimitRetryAfterMs,
        })
      : null;

  const successish =
    input.status === "success" ||
    input.status === "external_delay" ||
    input.status === "warning";

  await upsertCommercialEntityState({
    marketplaceAccountId: input.marketplaceAccountId,
    entity: input.entity,
    status: input.status,
    failureClass:
      input.status === "rate_limited" ||
      input.status === "permission_denied" ||
      input.status === "external_unavailable" ||
      input.status === "external_delay"
        ? input.status
        : input.error
          ? classifyCommercialError(input.error).failureClass
          : null,
    lastError: sanitizeCommercialError(input.error),
    latestDataDate,
    lastRequestedFrom: input.dateFrom,
    lastRequestedTo: input.dateTo,
    rowsUpsertedLast: input.rowsUpserted ?? 0,
    markSuccessfulExecution: successish,
    bumpRetry: needsRetry,
    clearRetry: successish || input.status === "permission_denied",
    nextRetryAt: successish || input.status === "permission_denied" ? null : nextRetry,
  });
}

export function resolveFinanceExternalDelay(input: {
  entity: CommercialSyncEntity;
  rowsUpserted: number;
  latestDataDate: string | null;
  dateTo: string;
  errorText: string | null;
}): { status: CommercialEntityStatus; error: string | null } | null {
  if (input.entity !== "finance" || input.rowsUpserted > 0 || input.errorText) return null;
  const lag = daysBetweenIso(input.latestDataDate, input.dateTo);
  if (lag == null || lag <= 0) return null;
  return {
    status: "external_delay",
    error:
      lag > FINANCE_EXTERNAL_DELAY_WARN_DAYS
        ? `Finance API returned no new rows; latest DB operation_date=${input.latestDataDate} (${lag}d behind). Likely WB publishing delay.`
        : `Finance API returned no new rows; latest DB operation_date=${input.latestDataDate}. Treating as external publishing delay.`,
  };
}

export async function finalizeStaleCommercialEntitiesRunning(
  marketplaceAccountId: string,
  reason: string
): Promise<number> {
  const { listCommercialEntityStates } = await import(
    "@/services/commercial-entity-sync-state-service"
  );
  const states = await listCommercialEntityStates(marketplaceAccountId);
  let finalized = 0;

  for (const row of states) {
    if (row.status !== "running") continue;
    const classified = classifyCommercialError(reason);
    await persistCommercialEntityOutcome({
      marketplaceAccountId,
      entity: row.entity as CommercialSyncEntity,
      status: classified.status === "rate_limited" ? classified.status : "failed",
      error: sanitizeCommercialError(reason),
      latestDataDate: row.latest_data_date,
      dateFrom: row.last_requested_from ?? "",
      dateTo: row.last_requested_to ?? "",
      priorRetryCount: row.retry_count ?? 0,
      bumpRetry: classified.status === "rate_limited" || classified.failureClass === "timeout",
    });
    finalized += 1;
  }

  return finalized;
}

/** Release entity rows stuck in `running` longer than TTL (idempotent). */
export async function releaseStaleCommercialEntityRunningIfNeeded(
  marketplaceAccountId?: string,
  staleTtlMs?: number
): Promise<number> {
  const { SYNC_RUN_STALE_TTL_MS } = await import(
    "@/lib/commercial-continuity/execution-bounds"
  );
  const ttl = staleTtlMs ?? SYNC_RUN_STALE_TTL_MS;
  const cutoff = Date.now() - ttl;
  const { listCommercialEntityStates, commercialEntityStateAvailable } = await import(
    "@/services/commercial-entity-sync-state-service"
  );
  if (!(await commercialEntityStateAvailable())) return 0;
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const sb = createAdminClient();
  let query = sb
    .from("commercial_entity_sync_state")
    .select("marketplace_account_id, entity, status, last_execution_at, updated_at")
    .eq("status", "running");
  if (marketplaceAccountId) {
    query = query.eq("marketplace_account_id", marketplaceAccountId);
  }
  const { data, error } = await query;
  if (error || !data?.length) return 0;

  const accountIds = new Set<string>();
  for (const row of data) {
    const ts = Date.parse(String(row.last_execution_at ?? row.updated_at ?? 0));
    if (Number.isFinite(ts) && ts < cutoff) {
      accountIds.add(String(row.marketplace_account_id));
    }
  }

  let released = 0;
  for (const accountId of accountIds) {
    released += await finalizeStaleCommercialEntitiesRunning(
      accountId,
      "Commercial entity sync interrupted (stale running recovered)"
    );
  }
  return released;
}
