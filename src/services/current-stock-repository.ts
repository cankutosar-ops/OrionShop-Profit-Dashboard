/** Single, reversible current-stock read switch. Defaults to legacy wb_stock. */
import type { SupabaseClient } from "@/lib/supabase/server";
import type { WbStock } from "@/types/database";

export type CurrentStockSource = "legacy" | "canonical";

export function currentStockSource(): CurrentStockSource {
  const value = process.env.ORION_CURRENT_STOCK_SOURCE || "legacy";
  if (value !== "legacy" && value !== "canonical") {
    throw new Error(`Invalid ORION_CURRENT_STOCK_SOURCE: ${value}`);
  }
  return value;
}

async function canonicalRows(accountId: string, client: SupabaseClient): Promise<WbStock[]> {
  const productByNm = new Map<number, string>();
  for (let from = 0;; from += 1000) {
    const { data, error } = await client.from("products")
      .select("id,nm_id")
      .eq("marketplace_account_id", accountId)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Canonical stock product lookup failed: ${error.message}`);
    const page = data ?? [];
    for (const product of page) {
      const nmId = Number(product.nm_id);
      const prior = productByNm.get(nmId);
      if (prior && prior !== String(product.id)) {
        throw new Error(`Canonical stock nmId ${nmId} maps to multiple account products`);
      }
      productByNm.set(nmId, String(product.id));
    }
    if (page.length < 1000) break;
  }
  const rows: WbStock[] = [];
  for (let from = 0;; from += 1000) {
    const { data, error } = await client.from("wb_current_stocks")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .order("nm_id")
      .order("chrt_id")
      .order("warehouse_key")
      .range(from, from + 999);
    if (error) throw new Error(`Canonical stock read failed: ${error.message}`);
    const page = data ?? [];
    for (const row of page) {
      const productId = productByNm.get(Number(row.nm_id));
      if (!productId) throw new Error(`Canonical stock nmId ${row.nm_id} has no account product`);
      rows.push({
        id: `${accountId}:${row.nm_id}:${row.chrt_id}:${row.warehouse_key}`,
        marketplace_account_id: accountId,
        product_id: productId,
        chrt_id: row.chrt_id,
        // Preserve variant separation even when catalog enrichment is absent.
        tech_size: row.tech_size?.trim() || String(row.chrt_id),
        barcode: row.barcode,
        warehouse: row.warehouse_name,
        quantity: row.quantity,
        quantity_full: row.quantity,
        in_way_to_client: row.in_way_to_client,
        in_way_from_client: row.in_way_from_client,
        last_synced_at: row.observed_at,
      });
    }
    if (page.length < 1000) break;
  }
  return rows;
}

export async function readCurrentStockRows(
  accountId: string,
  client: SupabaseClient,
  productId?: string
): Promise<WbStock[]> {
  if (currentStockSource() === "canonical") {
    const rows = await canonicalRows(accountId, client);
    return productId ? rows.filter((row) => String(row.product_id) === productId) : rows;
  }
  let query = client.from("wb_stock").select("*").eq("marketplace_account_id", accountId);
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query;
  if (error) throw new Error(`Legacy stock read failed: ${error.message}`);
  return (data ?? []) as WbStock[];
}

export async function readCurrentStockExtent(
  accountId: string,
  client: SupabaseClient
): Promise<{ earliestDate: string | null; latestDate: string | null; recordCount: number }> {
  const canonical = currentStockSource() === "canonical";
  const table = canonical ? "wb_current_stocks" : "wb_stock";
  const column = canonical ? "observed_at" : "last_synced_at";
  const base = () => client.from(table).select(column).eq("marketplace_account_id", accountId);
  const [{ data: first, error: firstError }, { data: last, error: lastError }, { count, error: countError }] = await Promise.all([
    base().order(column, { ascending: true }).limit(1),
    base().order(column, { ascending: false }).limit(1),
    client.from(table).select("*", { count: "exact", head: true }).eq("marketplace_account_id", accountId),
  ]);
  if (firstError || lastError || countError) throw new Error(`Current stock extent failed: ${(firstError || lastError || countError)?.message}`);
  return {
    earliestDate: (first?.[0] as unknown as Record<string, string> | undefined)?.[column] ?? null,
    latestDate: (last?.[0] as unknown as Record<string, string> | undefined)?.[column] ?? null,
    recordCount: count ?? 0,
  };
}

export async function readCurrentStockWarehouseNames(accountId: string, client: SupabaseClient): Promise<string[]> {
  const canonical = currentStockSource() === "canonical";
  const table = canonical ? "wb_current_stocks" : "wb_stock";
  const column = canonical ? "warehouse_name" : "warehouse";
  const names = new Set<string>();
  for (let from = 0;; from += 1000) {
    const { data, error } = await client.from(table).select(column)
      .eq("marketplace_account_id", accountId)
      .not(column, "is", null)
      .range(from, from + 999);
    if (error) {
      if (!canonical && /does not exist|schema cache|Could not find/i.test(error.message)) return [...names];
      throw new Error(`Current stock warehouse discovery failed: ${error.message}`);
    }
    const page = data ?? [];
    for (const row of page) {
      const name = String((row as unknown as Record<string, unknown>)[column] ?? "").trim();
      if (name) names.add(name);
    }
    if (page.length < 1000) break;
  }
  return [...names];
}
