import { createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WbStock } from "@/types/database";

export function buildStockKey(techSize: string | null | undefined, barcode: string | null | undefined): string {
  return `${techSize ?? ""}|${barcode ?? ""}`;
}

export async function fetchStockForProduct(
  productId: string,
  marketplaceAccountId: string,
  client?: SupabaseClient<Database>
): Promise<WbStock[]> {
  const supabase = client ?? (await createServerClient());
  const { data, error } = await supabase
    .from("wb_stock")
    .select("*")
    .eq("marketplace_account_id", marketplaceAccountId)
    .eq("product_id", productId);

  if (error) {
    throw new Error(`Failed to fetch stock: ${error.message}`);
  }
  return (data ?? []) as WbStock[];
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
