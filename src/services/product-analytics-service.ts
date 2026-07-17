import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  buildProductAnalyticsRows,
  buildProductAnalyticsTotals,
  buildProductAnalyticsV3Rows,
  pickBottomByNetProfit,
  pickBottomV3ByOperationalProfit,
  pickTopByNetProfit,
  pickTopV3ByOperationalProfit,
} from "@/lib/product-analytics";
import { getProductProfitability } from "@/services/dashboard-service";
import { getCurrentStockByProductId } from "@/services/inventory-report-service";
import { logScopeAudit } from "@/lib/scope-audit-log";
import type {
  ProductAnalyticsRow,
  ProductAnalyticsTotals,
  ProductAnalyticsV3Row,
  ScopedDateRange,
} from "@/types/database";

export type ProductAnalyticsReport = {
  range: ScopedDateRange;
  totals: ProductAnalyticsTotals;
  /** V2 rows — products with revenue > 0. */
  top10: ProductAnalyticsRow[];
  bottom10: ProductAnalyticsRow[];
  all: ProductAnalyticsRow[];
  /** V3 rows — orders > 0 OR purchases > 0 OR revenue > 0. */
  v3All: ProductAnalyticsV3Row[];
  v3Top10: ProductAnalyticsV3Row[];
  v3Bottom10: ProductAnalyticsV3Row[];
};

export async function getProductAnalytics(
  scope: ScopedDateRange
): Promise<ProductAnalyticsReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const [products, stockByProductId] = await Promise.all([
    getProductProfitability(scope, client),
    getCurrentStockByProductId(scope.marketplaceAccountId),
  ]);
  const all = buildProductAnalyticsRows(products);
  const v3All = buildProductAnalyticsV3Rows(products).map((row) => ({
    ...row,
    currentStock: stockByProductId.get(String(row.productId)) ?? 0,
  }));
  const totals = buildProductAnalyticsTotals(products);

  logScopeAudit("Product Analytics", scope, scope, {
    orders: products.reduce((sum, p) => sum + p.orders, 0),
    sales: products.reduce((sum, p) => sum + p.purchases, 0),
    finance: 0,
  });

  return {
    range: scope,
    totals,
    top10: pickTopByNetProfit(all, 10),
    bottom10: pickBottomByNetProfit(all, 10),
    all,
    v3All,
    v3Top10: pickTopV3ByOperationalProfit(v3All, 10),
    v3Bottom10: pickBottomV3ByOperationalProfit(v3All, 10),
  };
}
