import type { WbSyncEntity, WbSyncResult } from "@/lib/wildberries/api-client";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import { syncLog } from "@/lib/wildberries/sync-log";
import type { SyncTimingReport } from "@/lib/wildberries/sync-timer";
import { getActiveSyncTimer } from "@/lib/wildberries/sync-timer";
import type { SyncRunTrigger, SyncStatus } from "@/types/database";
import {
  markAccountSyncFinished,
  markAccountSyncStarted,
} from "@/services/marketplace-account-service";
import {
  allowsIncrementalFinanceSync,
  getAccountLifecycleState,
} from "@/services/account-lifecycle-service";
import {
  financeStatusToAccountSyncStatus,
  runFinanceSyncV2,
} from "@/lib/wildberries/finance-sync-v2";

export type DashboardSyncRequest = {
  marketplaceAccountId: string;
  dateFrom: string;
  dateTo: string;
  entities?: WbSyncEntity[];
  /** When true, lifecycle markers were already set by the background scheduler. */
  skipLifecycle?: boolean;
  /** Sync trigger for audit (default manual). */
  trigger?: SyncRunTrigger;
  requestId?: string | null;
};

export type DashboardSyncResponse = {
  success: boolean;
  marketplaceAccountId: string;
  lastSyncStatus: SyncStatus;
  results: WbSyncResult[];
  timing: SyncTimingReport | null;
};

function resolveSyncStatus(
  results: WbSyncResult[],
  financeStatus?: SyncStatus | null
): SyncStatus {
  if (results.length === 0) return "failed";
  if (financeStatus === "failed") return "failed";
  if (financeStatus === "warning" || financeStatus === "partial") return financeStatus;
  const hasErrors = results.some((r) => r.errors.length > 0);
  if (hasErrors) return "partial";
  return "success";
}

/**
 * Operational sync entry point for the Dashboard workspace.
 * Finance always uses Finance Sync V2 lookback revalidation (not UI from/to alone).
 */
export async function executeDashboardSync(
  request: DashboardSyncRequest
): Promise<DashboardSyncResponse> {
  const { marketplaceAccountId, dateFrom, dateTo, entities, skipLifecycle } = request;
  const syncEntities = entities ?? ["products", "orders", "sales", "finance", "stock"];
  const trigger = request.trigger ?? "manual";

  syncLog("dashboard-sync", "START", {
    marketplaceAccountId,
    dateFrom,
    dateTo,
    syncEntities,
    trigger,
  });

  let accountLifecycleStarted = false;
  if (!skipLifecycle) {
    await markAccountSyncStarted(marketplaceAccountId);
    accountLifecycleStarted = true;
  }

  try {
    const timer = getActiveSyncTimer();
    timer?.startPhase("account_meta");

    const syncService = await createWbSyncService(marketplaceAccountId);
    timer?.endPhase("account_meta");

    const nonFinance = syncEntities.filter((e) => e !== "finance");
    const results: WbSyncResult[] = [];

    if (nonFinance.length) {
      results.push(
        ...(await syncService.syncAll({
          marketplaceAccountId,
          dateFrom,
          dateTo,
          entities: nonFinance,
        }))
      );
    }

    let financeAccountStatus: SyncStatus | null = null;
    if (syncEntities.includes("finance")) {
      const lifecycle = await getAccountLifecycleState(marketplaceAccountId);
      const lifecycleStatus = lifecycle?.sync_lifecycle_status ?? null;
      const incrementalAllowed =
        !lifecycle?.schemaAvailable || allowsIncrementalFinanceSync(lifecycleStatus);

      if (!incrementalAllowed) {
        syncLog("dashboard-sync", "finance incremental blocked — historical backfill incomplete", {
          marketplaceAccountId,
          lifecycleStatus,
        });
        results.push({
          entity: "finance",
          recordsProcessed: 0,
          recordsInserted: 0,
          recordsUpdated: 0,
          errors: [
            `Finance incremental sync deferred until historical backfill completes (lifecycle=${lifecycleStatus ?? "unknown"})`,
          ],
          syncedAt: new Date().toISOString(),
        });
        financeAccountStatus = "partial";
      } else {
        timer?.startPhase("finance_v2");
        const finance = await runFinanceSyncV2({
          marketplaceAccountId,
          syncService,
          trigger,
          requestId: request.requestId ?? null,
        });
        timer?.endPhase("finance_v2");
        financeAccountStatus = financeStatusToAccountSyncStatus(finance.status);
        results.push({
          entity: "finance",
          recordsProcessed: finance.recordsProcessed,
          recordsInserted: finance.recordsInserted,
          recordsUpdated: finance.recordsUpdated,
          errors: [...finance.errors, ...finance.warnings.map((w) => `warning: ${w}`)],
          syncedAt: finance.syncedAt,
          reportIds: finance.reportIds,
          returnedFrom: finance.returnedFrom,
          returnedTo: finance.returnedTo,
        });
      }
    }

    const status = resolveSyncStatus(results, financeAccountStatus);
    await markAccountSyncFinished(marketplaceAccountId, status);
    accountLifecycleStarted = false;

    const timing = timer?.toReport() ?? null;

    syncLog("dashboard-sync", "END", {
      marketplaceAccountId,
      status,
      resultCount: results.length,
      totalMs: timing?.totalMs,
    });

    return {
      success: status === "success" || status === "partial" || status === "warning",
      marketplaceAccountId,
      lastSyncStatus: status,
      results,
      timing,
    };
  } catch (error) {
    if (accountLifecycleStarted) {
      await markAccountSyncFinished(marketplaceAccountId, "failed").catch(() => undefined);
    }
    throw error;
  }
}
