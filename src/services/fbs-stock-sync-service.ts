import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { getMarketplaceAccountForSync } from "@/services/marketplace-account-service";
import { fetchSellerWarehouses } from "@/lib/wildberries/seller-warehouses";
import { captureFbsStocks } from "@/lib/wildberries/fbs-stock";
import { persistSellerWarehouses } from "@/services/wb-seller-warehouse-service";
import { getSyncExecutionContext } from "@/lib/commercial-continuity/sync-execution-context";

type Deps = {
  client: AdminClient;
  loadAccount: typeof getMarketplaceAccountForSync;
  warehouses: typeof fetchSellerWarehouses;
  capture: typeof captureFbsStocks;
  saveWarehouses: typeof persistSellerWarehouses;
  now: () => number;
};
export async function syncFbsCurrentStock(accountId: string, options: {
  force?: boolean; apiKey?: string; deps?: Partial<Deps>;
} = {}): Promise<{ status: "captured" | "fresh" | "no_fbs_warehouses"; rows: number }> {
  if (!/^[1-9]\d*$/.test(accountId)) throw Error("Invalid FBS account");
  const deps: Deps = { client: options.deps?.client ?? createAdminClient(),
    loadAccount: getMarketplaceAccountForSync, warehouses: fetchSellerWarehouses,
    capture: captureFbsStocks, saveWarehouses: persistSellerWarehouses, now: Date.now, ...options.deps };
  const signal = getSyncExecutionContext()?.abortSignal;
  signal?.throwIfAborted();
  const recent = await deps.client.from("wb_fbs_current_stocks").select("observed_at")
    .eq("marketplace_account_id", accountId).order("observed_at", { ascending: false }).limit(1);
  if (recent.error) throw Error(["42P01", "PGRST205"].includes(recent.error.code)
    ? "FBS stock schema missing: apply wb_fbs_current_stock_evidence migration"
    : "FBS stock freshness read failed");
  const observed = recent.data?.[0]?.observed_at;
  const age = observed ? deps.now() - Date.parse(observed) : Infinity;
  // Manual Sync forces a fresh capture. Its daily-snapshot backup must not
  // immediately read the same FBS API a second time.
  if (!options.force && age >= 0 && age < 5 * 60 * 1000) return { status: "fresh", rows: 0 };
  const variants: Array<{ product_id: string; chrt_id?: number | null; tech_size: string | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    signal?.throwIfAborted();
    const result = await deps.client.from("product_variants").select("product_id,chrt_id,tech_size")
      .eq("marketplace_account_id", accountId).order("id").range(offset, offset + 999);
    if (result.error) throw Error("FBS variant catalog read failed");
    variants.push(...(result.data ?? []));
    if (variants.length > 50000) throw Error("FBS catalog exceeds bounds");
    if ((result.data?.length ?? 0) < 1000) break;
  }
  const token = options.apiKey ?? (await deps.loadAccount(accountId)).apiKey;
  const warehouses = await deps.warehouses(token);
  if (!warehouses.some(w => w.deliveryType === 1 && !w.isDeleting)) {
    if (observed) throw Error("No active FBS warehouse; previous stock retained pending review");
    return { status: "no_fbs_warehouses", rows: 0 };
  }
  const rows = await deps.capture(accountId, token, warehouses, variants, signal);
  signal?.throwIfAborted();
  await deps.saveWarehouses(accountId, warehouses, rows[0].observed_at, deps.client);
  const saved = await deps.client.rpc("replace_wb_fbs_current_stocks", { p_account_id: accountId, p_rows: rows });
  if (saved.error || saved.data !== rows.length) throw Error("Atomic FBS stock replacement failed; previous capture retained");
  return { status: "captured", rows: rows.length };
}
