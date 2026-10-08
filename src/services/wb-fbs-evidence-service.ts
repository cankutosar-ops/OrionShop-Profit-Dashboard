import type { SupabaseClient } from "@/lib/supabase/server";
import type { WbFbsOrderEvidence } from "@/lib/wildberries/fbs-orders";

export async function readFbsOrderEvidence(accountId: string, client: SupabaseClient) {
  const rows = [];
  for (let offset = 0;; offset += 1000) {
    const { data, error } = await client.from("wb_fbs_order_warehouse_evidence").select("*")
      .eq("marketplace_account_id", accountId).order("rid").range(offset, offset + 999);
    if (error) {
      if (["42P01", "PGRST205"].includes(error.code)) return { available: false, rows: [] };
      throw new Error(`FBS evidence read failed: ${error.code}`);
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return { available: true, rows };
  }
}

/** Append-only evidence: identical captures are idempotent; identity conflicts never overwrite. */
export async function persistFbsOrderEvidence(accountId: string, orders: WbFbsOrderEvidence[], observedAt: string, client: SupabaseClient) {
  if (!/^\d+$/.test(accountId) || Number(accountId) <= 0 || !Number.isFinite(Date.parse(observedAt))) throw new Error("Invalid FBS capture scope");
  if (!orders.length) return 0;
  const unique = new Map<string, WbFbsOrderEvidence>();
  for (const order of orders) {
    const previous = unique.get(order.rid);
    if (previous && JSON.stringify(previous) !== JSON.stringify(order)) throw new Error("Conflicting FBS capture identity");
    unique.set(order.rid, order);
  }
  const records = [...unique.values()].map(row => ({marketplace_account_id:accountId, rid:row.rid,
    assembly_order_id:row.assemblyOrderId, seller_warehouse_id:row.sellerWarehouseId,
    nm_id:row.nmId, chrt_id:row.chrtId, created_at:row.createdAt, observed_at:observedAt}));
  const existing = await readFbsOrderEvidence(accountId, client);
  if (!existing.available) throw new Error("FBS evidence migration is not applied");
  const previousByRid = new Map(existing.rows.map(row => [row.rid, row]));
  for (const record of records) {
    const row = previousByRid.get(record.rid);
    if (row && (Number(row.assembly_order_id) !== record.assembly_order_id || Number(row.seller_warehouse_id) !== record.seller_warehouse_id ||
      Number(row.nm_id) !== record.nm_id || Number(row.chrt_id) !== record.chrt_id || Date.parse(row.created_at) !== Date.parse(record.created_at))) throw new Error("Existing FBS evidence identity conflict; capture was not inserted");
  }
  const { error } = await client.from("wb_fbs_order_warehouse_evidence").upsert(records, {onConflict:"marketplace_account_id,rid",ignoreDuplicates:true});
  if (error) throw new Error(`FBS evidence insert failed: ${error.code}`);
  const saved = await readFbsOrderEvidence(accountId, client);
  const byRid = new Map(saved.rows.map(row => [row.rid, row]));
  for (const record of records) {
    const row = byRid.get(record.rid);
    if (!row || Number(row.assembly_order_id) !== record.assembly_order_id || Number(row.seller_warehouse_id) !== record.seller_warehouse_id ||
      Number(row.nm_id) !== record.nm_id || Number(row.chrt_id) !== record.chrt_id || Date.parse(row.created_at) !== Date.parse(record.created_at)) throw new Error("Persisted FBS evidence identity conflict; existing evidence retained");
  }
  return records.length;
}
