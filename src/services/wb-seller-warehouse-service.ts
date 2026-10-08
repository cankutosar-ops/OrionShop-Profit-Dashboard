import type { SupabaseClient } from "@/lib/supabase/server";
import type { WbSellerWarehouse } from "@/lib/wildberries/seller-warehouses";

/** UI reads only persisted metadata. An unapplied additive migration preserves older reads. */
export async function readSellerWarehouses(accountId: string, client: SupabaseClient) {
  const rows = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await client.from("wb_seller_warehouses")
      .select("*").eq("marketplace_account_id", accountId)
      .order("seller_warehouse_id").range(from, from + 999);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return [];
      throw new Error(`Seller warehouse catalog read failed: ${error.code}`);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

/** Admin capture path only. Upsert metadata; never rename historical transactions or delete rows. */
export async function persistSellerWarehouses(accountId: string, warehouses: WbSellerWarehouse[],
  observedAt: string, client: SupabaseClient) {
  if (!Number.isSafeInteger(Number(accountId)) || Number(accountId) <= 0 || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error("Invalid seller warehouse capture scope");
  }
  if (!warehouses.length) return 0;
  const rows = warehouses.map(row => ({ marketplace_account_id: accountId,
    seller_warehouse_id: row.id, name: row.name, wb_office_id: row.officeId,
    delivery_type: row.deliveryType, is_deleting: row.isDeleting,
    is_processing: row.isProcessing, observed_at: observedAt }));
  const { error } = await client.from("wb_seller_warehouses")
    .upsert(rows, { onConflict: "marketplace_account_id,seller_warehouse_id" });
  if (error) throw new Error(`Seller warehouse catalog persistence failed: ${error.code}`);
  return rows.length;
}
