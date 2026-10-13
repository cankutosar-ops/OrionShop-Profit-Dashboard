import {readFbsStockRows} from "@/services/fbs-stock-service";
import {indexFbsStockByProduct} from "@/lib/wildberries/fbs-stock";
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
import { getProductProfitabilityBuild } from "@/services/dashboard-service";
import { getCurrentStockByProductId } from "@/services/inventory-report-service";
import { logScopeAudit } from "@/lib/scope-audit-log";
import type { ProductLogisticsReconciliation } from "@/lib/product-logistics-attribution";
import type {
  ProductAnalyticsRow,
  ProductAnalyticsTotals,
  ProductAnalyticsV3Row,
  ScopedDateRange,
} from "@/types/database";

export type ProductAnalyticsReport = {
  range: ScopedDateRange;
  totals: ProductAnalyticsTotals;
  /** V2 rows — products with attributed activity, including returns and expenses. */
  top10: ProductAnalyticsRow[];
  bottom10: ProductAnalyticsRow[];
  all: ProductAnalyticsRow[];
  /** V3 rows — products with attributed activity, including returns and expenses. */
  v3All: ProductAnalyticsV3Row[];
  v3Top10: ProductAnalyticsV3Row[];
  v3Bottom10: ProductAnalyticsV3Row[];
  logisticsReconciliation: ProductLogisticsReconciliation;
};

export async function getProductAnalytics(
  scope: ScopedDateRange
): Promise<ProductAnalyticsReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const [build, stockByProductId, fbsRows] = await Promise.all([
    getProductProfitabilityBuild(scope),
    getCurrentStockByProductId(scope.marketplaceAccountId),
    readFbsStockRows(scope.marketplaceAccountId, client),
  ]);
  const products = build.rows;
  const all = buildProductAnalyticsRows(products);
  const fbsByProduct = indexFbsStockByProduct(fbsRows);
  const v3All = buildProductAnalyticsV3Rows(products).map((row) => ({
    ...row,
    currentStock: stockByProductId.get(String(row.productId)) ?? 0,
    fbsStock: fbsByProduct.get(String(row.productId))?.quantity ?? null,
    fbsStockIncomplete: fbsByProduct.get(String(row.productId))?.incomplete ?? false,
    fbsStockObservedAt: fbsByProduct.get(String(row.productId))?.observedAt ?? null,
  }));
  const totals = buildProductAnalyticsTotals(products, {
    unallocatedLogistics: build.logisticsReconciliation.unallocatedLogistics,
    accountLogisticsTotal: build.logisticsReconciliation.accountLogisticsTotal,
    unallocatedRevenue: build.unallocatedRevenue,
    accountRevenue: build.accountRevenue,
    accountMarketplaceFees: build.accountMarketplaceFees,
    unallocatedMarketplaceFees: build.unattributedMarketplaceFees,
  });

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
    logisticsReconciliation: build.logisticsReconciliation,
  };
}
