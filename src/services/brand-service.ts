import { createServerClient } from "@/lib/supabase/server";
import type { Brand } from "@/types/database";

type ProductBrandRow = {
  brand: Brand | null;
};

/** Brands that appear on products for the given marketplace account. */
export async function getBrandsForMarketplaceAccount(
  marketplaceAccountId: string
): Promise<Brand[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("brand:brands(id, name, created_at)")
    .eq("marketplace_account_id", marketplaceAccountId);

  if (error) {
    throw new Error(`Failed to fetch brands for account: ${error.message}`);
  }

  const byId = new Map<string, Brand>();
  for (const row of (data ?? []) as ProductBrandRow[]) {
    if (row.brand?.id) {
      byId.set(row.brand.id, row.brand);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
