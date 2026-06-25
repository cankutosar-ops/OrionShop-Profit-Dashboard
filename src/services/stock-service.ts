import { WbApiClient } from "@/lib/wildberries/api-client";
import { createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WbStock } from "@/types/database";

const STOCK_TTL_MS = 60 * 60 * 1000;

export function buildStockKey(techSize: string | null | undefined, barcode: string | null | undefined): string {
  return `${techSize ?? ""}|${barcode ?? ""}`;
}

export async function fetchStockForProduct(
  productId: string,
  client?: SupabaseClient<Database>
): Promise<WbStock[]> {
  const supabase = client ?? createServerClient();
  const { data, error } = await supabase
    .from("wb_stock")
    .select("*")
    .eq("product_id", productId);

  if (error) throw new Error(`Failed to fetch stock: ${error.message}`);
  return (data ?? []) as WbStock[];
}

export async function syncStockForProduct(
  productId: string,
  nmId: number,
  client?: SupabaseClient<Database>
): Promise<WbStock[]> {
  const supabase = client ?? createServerClient();
  const existing = await fetchStockForProduct(productId, supabase);
  const newest = existing.reduce((max, row) => Math.max(max, Date.parse(row.synced_at)), 0);

  if (newest && Date.now() - newest < STOCK_TTL_MS) {
    return existing;
  }

  const api = new WbApiClient();
  const rows = await api.fetchStocks();
  const productRows = rows.filter((row) => row.nmId === nmId);

  const aggregated = new Map<string, { tech_size: string; barcode: string | null; quantity: number }>();
  for (const row of productRows) {
    const key = buildStockKey(row.techSize, row.barcode);
    const current = aggregated.get(key) ?? {
      tech_size: row.techSize ?? "",
      barcode: row.barcode ?? null,
      quantity: 0,
    };
    current.quantity += row.quantity ?? row.quantityFull ?? 0;
    aggregated.set(key, current);
  }

  const syncedAt = new Date().toISOString();
  const upserts = Array.from(aggregated.values()).map((row) => ({
    product_id: productId,
    tech_size: row.tech_size,
    barcode: row.barcode,
    quantity: row.quantity,
    synced_at: syncedAt,
  }));

  if (upserts.length) {
    const { error } = await supabase.from("wb_stock").upsert(upserts, {
      onConflict: "product_id,tech_size,barcode",
    });
    if (error) throw new Error(`Failed to upsert stock: ${error.message}`);
  }

  return fetchStockForProduct(productId, supabase);
}

export function getStockQuantity(
  stockRows: WbStock[],
  techSize: string,
  barcode: string | null
): number {
  const key = buildStockKey(techSize, barcode);
  return stockRows
    .filter((row) => buildStockKey(row.tech_size, row.barcode) === key)
    .reduce((sum, row) => sum + row.quantity, 0);
}
