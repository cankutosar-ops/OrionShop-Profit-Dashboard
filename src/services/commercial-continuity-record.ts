/**
 * After a dashboard/manual sync, refresh commercial entity coverage state
 * so Monitoring and continuity share the same DB-backed picture.
 */
import { COMMERCIAL_RETRY_POLICY, COMMERCIAL_SYNC_ENTITIES } from "@/lib/commercial-continuity/types";
import type { CommercialEntityStatus, CommercialSyncEntity } from "@/lib/commercial-continuity/types";
import {
  classifyCommercialError,
  computeNextRetryAtPreferServer,
  sanitizeCommercialError,
} from "@/lib/commercial-continuity/classify";
import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";
import {
  getCommercialEntityState,
  readLatestDataDateFromDb,
  upsertCommercialEntityState,
} from "@/services/commercial-entity-sync-state-service";
import type { WbSyncResult } from "@/lib/wildberries/api-client";

export async function recordCommercialStateFromSyncResults(input: {
  marketplaceAccountId: string;
  dateFrom: string;
  dateTo: string;
  results: WbSyncResult[];
}): Promise<void> {
  for (const entity of COMMERCIAL_SYNC_ENTITIES) {
    const row = input.results.find((r) => r.entity === entity);
    if (!row) continue;

    const errorText = row.errors.find((e) => !String(e).startsWith("warning:")) ?? null;
    const latestDataDate = await readLatestDataDateFromDb(input.marketplaceAccountId, entity);
    const rowsUpserted = (row.recordsInserted ?? 0) + (row.recordsUpdated ?? 0);

    let status: CommercialEntityStatus = "success";
    if (errorText) {
      status = classifyCommercialError(String(errorText)).status;
    } else if (entity === "finance" && rowsUpserted === 0 && latestDataDate) {
      status = "external_delay";
    }

    const successish =
      status === "success" || status === "external_delay" || status === "warning";

    const existing = await getCommercialEntityState(
      input.marketplaceAccountId,
      entity as CommercialSyncEntity
    );
    const priorRetryCount = existing?.retry_count ?? 0;
    const noRetry = COMMERCIAL_RETRY_POLICY.noRetryStatuses.includes(status);
    const needsRetry =
      !noRetry &&
      (status === "rate_limited" ||
        status === "failed" ||
        status === "partial" ||
        status === "external_unavailable");

    const nextRetry =
      needsRetry && priorRetryCount < COMMERCIAL_RETRY_POLICY.maxAttempts
        ? computeNextRetryAtPreferServer({
            retryCount: priorRetryCount,
            baseDelaySeconds: COMMERCIAL_RETRY_POLICY.baseDelaySeconds,
            maxDelaySeconds: COMMERCIAL_RETRY_POLICY.maxDelaySeconds,
            serverRetryAfterMs: getSyncExecutionContext()?.lastRateLimitRetryAfterMs,
          })
        : null;

    await upsertCommercialEntityState({
      marketplaceAccountId: input.marketplaceAccountId,
      entity: entity as CommercialSyncEntity,
      status,
      failureClass:
        status === "rate_limited" ||
        status === "permission_denied" ||
        status === "external_unavailable" ||
        status === "external_delay"
          ? status
          : errorText
            ? classifyCommercialError(String(errorText)).failureClass
            : null,
      lastError: sanitizeCommercialError(errorText ? String(errorText) : null),
      latestDataDate,
      lastRequestedFrom: input.dateFrom,
      lastRequestedTo: input.dateTo,
      rowsUpsertedLast: rowsUpserted,
      markSuccessfulExecution: successish,
      bumpRetry: needsRetry,
      clearRetry: successish || status === "permission_denied",
      nextRetryAt: successish || status === "permission_denied" ? null : nextRetry,
    });
  }
}
