import { WbApiClient } from "@/lib/wildberries/api-client";
import { mapCompleteStock } from "@/lib/wildberries/complete-stock";
import { persistCanonicalCurrentStocks } from "@/lib/marketplace-adapters/wildberries/canonical-stock";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { runWithSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";
import type { WbWarehouseStockItem } from "@/lib/wildberries/types";

export type CurrentStockDeps = {
  fetchComplete: (accountId: string) => Promise<WbWarehouseStockItem[]>;
  client: AdminClient;
};

/** One complete account, one transaction. Failure propagates to the worker; no fallback. */
export async function syncCanonicalCurrentStock(accountId: string, deadlineMs: number,
  deps?: Partial<CurrentStockDeps>): Promise<number> {
  if (!Number.isSafeInteger(Number(accountId)) || Number(accountId) <= 0) throw new Error("Invalid account ID");
  const remaining = Math.floor(deadlineMs - Date.now());
  if (remaining <= 0 || !Number.isFinite(remaining)) throw new Error("Current stock budget exhausted");
  const abortSignal = AbortSignal.timeout(Math.min(remaining, 2_147_483_647));
  return runWithSyncExecutionContext({ abortSignal, marketplaceAccountId: accountId,
    wb429MaxRetries: 1, wb429MaxTotalWaitMs: 0 }, async () => {
    const fetchComplete = deps?.fetchComplete ?? (async (id: string) => {
      const account = await getMarketplaceAccountForSync(id);
      return new WbApiClient(account.apiKey).fetchWbWarehousesStock();
    });
    const items = mapCompleteStock(await fetchComplete(accountId));
    abortSignal.throwIfAborted();
    return persistCanonicalCurrentStocks(accountId, items, deps?.client ?? createAdminClient());
  });
}
