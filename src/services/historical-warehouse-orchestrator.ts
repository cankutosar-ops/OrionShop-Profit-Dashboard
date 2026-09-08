/**
 * Sprint 11 — Historical Data Warehouse orchestrator.
 *
 * Account path (existing lifecycle statuses):
 * NEW_ACCOUNT → HISTORICAL_BACKFILL_RUNNING → HISTORICAL_BACKFILL_VERIFYING
 *   → HISTORICAL_BACKFILL_COMPLETE → INCREMENTAL_SYNC_ACTIVE → HEALTHY
 *
 * Entity path (warehouse_entity_sync_state):
 * pending → historical_backfill_running → verifying → complete
 *   → incremental_sync_active → healthy
 *
 * Verification remains the only promotion into HEALTHY at account level
 * (account-lifecycle-service). Warehouse entity matrix tracks per-domain readiness.
 */

import { WAREHOUSE_DOMAINS, WAREHOUSE_ENTITIES } from "@/lib/historical-warehouse/types";
import type { WarehouseEntity, WarehouseImportTrigger } from "@/lib/historical-warehouse/types";
import { importHistoricalInventoryFromArchives } from "@/services/historical-inventory-import-service";
import { listAvailableSnapshotDates } from "@/services/historical-inventory-service";
import type { DailyInventorySnapshotResult } from "@/services/inventory-daily-snapshot-service";
import {
  ensureWarehouseEntityRows,
  entityAllowsIncremental,
  getWarehouseEntityState,
  listWarehouseEntityStates,
  updateWarehouseEntityState,
} from "@/services/warehouse-entity-sync-state-service";
import {
  finishWarehouseImportAudit,
  listWarehouseImportAudits,
  startWarehouseImportAudit,
} from "@/services/warehouse-import-audit-service";
import { getAccountLifecycleState } from "@/services/account-lifecycle-service";
import { resolve } from "path";

export type WarehouseFoundationStatus = {
  marketplaceAccountId: string;
  accountLifecycleStatus: string | null;
  domains: typeof WAREHOUSE_DOMAINS;
  entities: Awaited<ReturnType<typeof listWarehouseEntityStates>>;
  recentAudits: Awaited<ReturnType<typeof listWarehouseImportAudits>>;
};

export async function getWarehouseFoundationStatus(
  marketplaceAccountId: string
): Promise<WarehouseFoundationStatus> {
  await ensureWarehouseEntityRows(marketplaceAccountId);
  await mirrorFinanceEntityFromLifecycle(marketplaceAccountId);

  const [lifecycle, entities, recentAudits] = await Promise.all([
    getAccountLifecycleState(marketplaceAccountId),
    listWarehouseEntityStates(marketplaceAccountId),
    listWarehouseImportAudits(marketplaceAccountId, 15),
  ]);

  return {
    marketplaceAccountId,
    accountLifecycleStatus: lifecycle?.sync_lifecycle_status ?? null,
    domains: WAREHOUSE_DOMAINS,
    entities,
    recentAudits,
  };
}

/**
 * Mirror finance lifecycle columns into warehouse_entity_sync_state
 * so the warehouse matrix stays coherent without rewriting finance backfill.
 */
export async function mirrorFinanceEntityFromLifecycle(
  marketplaceAccountId: string
): Promise<void> {
  const lifecycle = await getAccountLifecycleState(marketplaceAccountId);
  if (!lifecycle?.schemaAvailable) return;

  const status = lifecycle.sync_lifecycle_status;
  let stage:
    | "pending"
    | "historical_backfill_running"
    | "verifying"
    | "complete"
    | "incremental_sync_active"
    | "healthy"
    | "failed" = "pending";

  if (status === "HISTORICAL_BACKFILL_RUNNING") stage = "historical_backfill_running";
  else if (status === "HISTORICAL_BACKFILL_VERIFYING") stage = "verifying";
  else if (status === "HISTORICAL_BACKFILL_COMPLETE") stage = "complete";
  else if (status === "INCREMENTAL_SYNC_ACTIVE") stage = "incremental_sync_active";
  else if (status === "HEALTHY") stage = "healthy";
  else if (status === "FAILED" || status === "PARTIAL") stage = "failed";
  else if (status === "RECOVERING") stage = "historical_backfill_running";

  await updateWarehouseEntityState({
    marketplaceAccountId,
    entity: "finance",
    stage,
    progress: {
      ...(lifecycle.finance_backfill_progress ?? {}),
      from: lifecycle.finance_backfill_from ?? undefined,
      to: lifecycle.finance_backfill_to ?? undefined,
      strategy: lifecycle.finance_backfill_strategy ?? undefined,
    },
    errorMessage: lifecycle.finance_backfill_error,
    markSuccessfulSync: Boolean(lifecycle.finance_backfill_verified_at),
    markCompleted: Boolean(
      lifecycle.finance_backfill_completed_at || lifecycle.finance_backfill_verified_at
    ),
  });
}

export type WarehouseBackfillResult = {
  marketplaceAccountId: string;
  entity: WarehouseEntity;
  status: "success" | "partial" | "failed" | "skipped";
  message: string;
  auditId: string | null;
  recordsRead: number;
  rowsUpserted: number;
};

/**
 * Run historical backfill for one warehouse entity (idempotent).
 * Inventory: archive CSV import. Other entities: not yet implemented (returns skipped).
 */
export async function runWarehouseEntityHistoricalBackfill(params: {
  marketplaceAccountId: string;
  entity: WarehouseEntity;
  trigger?: WarehouseImportTrigger;
  archiveRoot?: string;
}): Promise<WarehouseBackfillResult> {
  const { marketplaceAccountId, entity } = params;
  const trigger = params.trigger ?? "manual";
  const domain = WAREHOUSE_DOMAINS[entity];

  await ensureWarehouseEntityRows(marketplaceAccountId);

  if (!domain.historicalBackfillImplemented) {
    return {
      marketplaceAccountId,
      entity,
      status: "skipped",
      message: `${domain.label} historical backfill is registered but not implemented yet.`,
      auditId: null,
      recordsRead: 0,
      rowsUpserted: 0,
    };
  }

  if (entity === "finance") {
    await mirrorFinanceEntityFromLifecycle(marketplaceAccountId);
    return {
      marketplaceAccountId,
      entity,
      status: "skipped",
      message:
        "Finance historical backfill is owned by account lifecycle (POST /api/sync/account-lifecycle).",
      auditId: null,
      recordsRead: 0,
      rowsUpserted: 0,
    };
  }

  if (entity !== "inventory") {
    return {
      marketplaceAccountId,
      entity,
      status: "skipped",
      message: `No warehouse historical runner for ${entity} yet.`,
      auditId: null,
      recordsRead: 0,
      rowsUpserted: 0,
    };
  }

  const auditId = await startWarehouseImportAudit({
    marketplaceAccountId,
    entity: "inventory",
    trigger,
    currentDataset: "STOCK_HISTORY_DAILY_CSV",
    meta: { archiveRoot: params.archiveRoot ?? "exports/historical-inventory" },
  });

  await updateWarehouseEntityState({
    marketplaceAccountId,
    entity: "inventory",
    stage: "historical_backfill_running",
    currentDataset: "STOCK_HISTORY_DAILY_CSV",
    markStarted: true,
    errorMessage: null,
  });

  try {
    const archiveRoot =
      params.archiveRoot ?? resolve(process.cwd(), "exports/historical-inventory");
    const importResult = await importHistoricalInventoryFromArchives(archiveRoot, {
      accountIds: [marketplaceAccountId],
    });

    const accountPart = importResult.accountsProcessed.find(
      (a) => String(a.accountId) === String(marketplaceAccountId)
    );
    const recordsRead = accountPart?.rowsParsed ?? 0;
    const rowsUpserted = accountPart?.rowsUpserted ?? 0;
    const importError = accountPart?.error;

    if (importError) {
      await finishWarehouseImportAudit({
        auditId,
        status: "failed",
        recordsRead,
        rowsInserted: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        validationResult: "FAIL",
        errors: [importError],
        currentDataset: accountPart?.source ?? null,
      });
      await updateWarehouseEntityState({
        marketplaceAccountId,
        entity: "inventory",
        stage: "failed",
        errorMessage: importError,
        markFailedSync: true,
        bumpRetry: true,
      });
      return {
        marketplaceAccountId,
        entity,
        status: "failed",
        message: importError,
        auditId,
        recordsRead,
        rowsUpserted: 0,
      };
    }

    await updateWarehouseEntityState({
      marketplaceAccountId,
      entity: "inventory",
      stage: "verifying",
      currentDataset: accountPart?.source ?? "STOCK_HISTORY_DAILY_CSV",
    });

    const dates = await listAvailableSnapshotDates(String(marketplaceAccountId));
    const validationOk = dates.length > 0 && recordsRead > 0;

    await updateWarehouseEntityState({
      marketplaceAccountId,
      entity: "inventory",
      stage: validationOk ? "complete" : "failed",
      progress: {
        snapshotDates: dates,
        source: accountPart?.source,
        from: dates.length ? dates[dates.length - 1] : undefined,
        to: dates.length ? dates[0] : undefined,
      },
      markCompleted: validationOk,
      markSuccessfulSync: validationOk,
      markFailedSync: !validationOk,
      errorMessage: validationOk
        ? null
        : "Verification failed: no snapshot dates in warehouse after import",
    });

    // After historical complete, entity is ready for incremental (daily snapshot) when implemented.
    if (validationOk) {
      await updateWarehouseEntityState({
        marketplaceAccountId,
        entity: "inventory",
        stage: "incremental_sync_active",
      });
    }

    await finishWarehouseImportAudit({
      auditId,
      status: validationOk ? "success" : "partial",
      recordsRead,
      rowsInserted: rowsUpserted,
      rowsUpdated: 0,
      rowsSkipped: Math.max(0, recordsRead - rowsUpserted),
      validationResult: validationOk ? "PASS" : "FAIL",
      errors: validationOk ? [] : ["No snapshot dates after import"],
      currentDataset: accountPart?.source ?? null,
      meta: { snapshotDates: dates },
    });

    return {
      marketplaceAccountId,
      entity,
      status: validationOk ? "success" : "partial",
      message: validationOk
        ? `Inventory historical import complete (${dates.length} snapshot dates).`
        : "Import finished but verification found no snapshot dates.",
      auditId,
      recordsRead,
      rowsUpserted,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishWarehouseImportAudit({
      auditId,
      status: "failed",
      validationResult: "FAIL",
      errors: [message],
    });
    await updateWarehouseEntityState({
      marketplaceAccountId,
      entity: "inventory",
      stage: "failed",
      errorMessage: message,
      markFailedSync: true,
      bumpRetry: true,
    });
    return {
      marketplaceAccountId,
      entity,
      status: "failed",
      message,
      auditId,
      recordsRead: 0,
      rowsUpserted: 0,
    };
  }
}

/** Initialize all entity rows for a new account (call from account create / lifecycle). */
export async function initializeWarehouseFoundationForAccount(
  marketplaceAccountId: string
): Promise<void> {
  await ensureWarehouseEntityRows(marketplaceAccountId);
  await mirrorFinanceEntityFromLifecycle(marketplaceAccountId);
}

export function listImplementedHistoricalEntities(): WarehouseEntity[] {
  return WAREHOUSE_ENTITIES.filter((e) => WAREHOUSE_DOMAINS[e].historicalBackfillImplemented);
}

/**
 * Sprint 11.1 — incremental inventory daily snapshot for one account.
 * Safe to call repeatedly (idempotent upsert for snapshot_date).
 */
export async function runWarehouseEntityIncrementalSync(params: {
  marketplaceAccountId: string;
  entity: WarehouseEntity;
  snapshotDate?: string;
  trigger?: WarehouseImportTrigger;
}): Promise<DailyInventorySnapshotResult | WarehouseBackfillResult> {
  const { marketplaceAccountId, entity } = params;
  const domain = WAREHOUSE_DOMAINS[entity];

  if (!domain.incrementalSyncImplemented) {
    return {
      marketplaceAccountId,
      entity,
      status: "skipped",
      message: `${domain.label} incremental sync is not implemented yet.`,
      auditId: null,
      recordsRead: 0,
      rowsUpserted: 0,
    };
  }

  if (entity !== "inventory") {
    return {
      marketplaceAccountId,
      entity,
      status: "skipped",
      message: `No warehouse incremental runner for ${entity} in this path (use operational sync).`,
      auditId: null,
      recordsRead: 0,
      rowsUpserted: 0,
    };
  }

  await ensureWarehouseEntityRows(marketplaceAccountId);
  // Sprint 10.7 — inventory continuity is always allowed (activation→today snapshots).
  // Stage gates apply to other entities; inventory uses dedicated continuity path.
  const { runInventorySnapshotContinuityForAccount } = await import(
    "@/services/inventory-snapshot-continuity-service"
  );
  const continuity = await runInventorySnapshotContinuityForAccount(marketplaceAccountId, {
    snapshotDate: params.snapshotDate,
    trigger: params.trigger ?? "scheduled",
  });
  return continuity.capture;
}
