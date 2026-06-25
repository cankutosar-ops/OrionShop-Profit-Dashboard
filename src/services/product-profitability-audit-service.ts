import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  buildProductProfitabilityAuditRows,
  sumProductProfitabilityAuditRows,
} from "@/lib/product-profitability-audit";
import { getProductProfitability } from "@/services/dashboard-service";
import type { DateRange, ProductProfitabilityAuditRow } from "@/types/database";

export type ProductProfitabilityAuditReport = {
  rows: ProductProfitabilityAuditRow[];
  totals: ProductProfitabilityAuditRow;
  range: DateRange;
  productCount: number;
};

export async function getProductProfitabilityAudit(
  range: DateRange,
  limit = 20
): Promise<ProductProfitabilityAuditReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const products = await getProductProfitability(range, client);
  const rows = buildProductProfitabilityAuditRows(products, limit);
  const totals = sumProductProfitabilityAuditRows(rows);

  return {
    rows,
    totals,
    range,
    productCount: products.filter((product) => product.revenue > 0).length,
  };
}
