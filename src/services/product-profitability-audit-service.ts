import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  buildProductProfitabilityAuditRows,
  sumProductProfitabilityAuditRows,
} from "@/lib/product-profitability-audit";
import { getProductProfitability } from "@/services/dashboard-service";
import type { ProductProfitabilityAuditRow, ScopedDateRange } from "@/types/database";

export type ProductProfitabilityAuditReport = {
  rows: ProductProfitabilityAuditRow[];
  totals: ProductProfitabilityAuditRow;
  range: ScopedDateRange;
  productCount: number;
};

export async function getProductProfitabilityAudit(
  scope: ScopedDateRange,
  limit = 20
): Promise<ProductProfitabilityAuditReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const products = await getProductProfitability(scope, client);
  const rows = buildProductProfitabilityAuditRows(products, limit);
  const totals = sumProductProfitabilityAuditRows(rows);

  return {
    rows,
    totals,
    range: scope,
    productCount: products.filter((product) => product.revenue > 0).length,
  };
}
