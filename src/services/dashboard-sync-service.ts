import type { WbSyncEntity, WbSyncResult } from "@/lib/wildberries/api-client";
import { createWbSyncService } from "@/lib/wildberries/sync-service";
import { syncLog } from "@/lib/wildberries/sync-log";
import type { SyncStatus } from "@/types/database";
import {
  markAccountSyncFinished,
  markAccountSyncStarted,
} from "@/services/marketplace-account-service";

export type DashboardSyncRequest = {
  marketplaceAccountId: string;
  dateFrom: string;
  dateTo: string;
  entities?: WbSyncEntity[];
};

export type DashboardSyncResponse = {
  success: boolean;
  marketplaceAccountId: string;
  lastSyncStatus: SyncStatus;
  results: WbSyncResult[];
};

function resolveSyncStatus(hasErrors: boolean, resultsCount: number): SyncStatus {
  if (resultsCount === 0) return "failed";
  if (!hasErrors) return "success";
  return "partial";
}

/**
 * Operational sync entry point for the Dashboard workspace.
 * Finance categorization is applied during sync via mapFinanceRowsFromReport.
 */
export async function executeDashboardSync(
  request: DashboardSyncRequest
): Promise<DashboardSyncResponse> {
  const { marketplaceAccountId, dateFrom, dateTo, entities } = request;
  const syncEntities = entities ?? ["products", "orders", "sales", "finance", "stock"];

  syncLog("dashboard-sync", "START", {
    marketplaceAccountId,
    dateFrom,
    dateTo,
    syncEntities,
  });

  await markAccountSyncStarted(marketplaceAccountId);

  try {
    const syncService = await createWbSyncService(marketplaceAccountId);
    const results = await syncService.syncAll({
      marketplaceAccountId,
      dateFrom,
      dateTo,
      entities: syncEntities,
    });

    const hasErrors = results.some((r) => r.errors.length > 0);
    const status = resolveSyncStatus(hasErrors, results.length);
    await markAccountSyncFinished(marketplaceAccountId, status);

    syncLog("dashboard-sync", "END", {
      marketplaceAccountId,
      status,
      resultCount: results.length,
    });

    return {
      success: !hasErrors,
      marketplaceAccountId,
      lastSyncStatus: status,
      results,
    };
  } catch (error) {
    await markAccountSyncFinished(marketplaceAccountId, "failed").catch(() => undefined);
    throw error;
  }
}
