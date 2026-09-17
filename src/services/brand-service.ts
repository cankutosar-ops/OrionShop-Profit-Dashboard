import { createServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import type { Brand } from "@/types/database";

type ProductBrandRow = {
  brand: Brand | null;
};

/** Brands that appear on products for the given marketplace account. */
export async function getBrandsForMarketplaceAccount(
  marketplaceAccountId: string
): Promise<Brand[]> {
  const supabase = await createServerClient();
  const rows = await fetchAllRows<ProductBrandRow>(supabase, "products", {
    marketplaceAccountId,
    selectColumns: "id, brand:brands(id, name, created_at)",
    orderBy: { column: "id" },
  });

  const byId = new Map<string, Brand>();
  for (const row of rows) {
    if (row.brand?.id != null && row.brand.id !== "") {
      const id = String(row.brand.id);
      byId.set(id, { ...row.brand, id });
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
