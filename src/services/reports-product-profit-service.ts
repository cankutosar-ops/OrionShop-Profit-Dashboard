import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { buildProductProfitabilityRows } from "@/lib/product-profitability-builder";
import { calculateNetMarginPercent } from "@/lib/profit-margin";
import {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchOrdersInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import type { ProductWithRelations, ScopedDateRange } from "@/types/database";
import { logScopeAudit } from "@/lib/scope-audit-log";

export type ProductProfitReportRow = {
  productId: string;
  sku: string;
  model: string;
  brand: string;
  revenue: number;
  orders: number;
  purchases: number;
  marketplaceFee: number;
  logistics: number;
  advertising: number;
  productCost: number;
  netProfit: number;
  marginPercent: number;
};

export type ProductProfitReport = {
  scope: ScopedDateRange;
  rows: ProductProfitReportRow[];
};

function applyBrandScope(products: ProductWithRelations[], brandId?: string): ProductWithRelations[] {
  if (!brandId) return products;
  return products.filter((product) => String(product.brand_id) === String(brandId));
}

/**
 * Reports-only product profitability read model.
 * Uses persisted queries + shared pure financial logic only (no sync, no operational side effects).
 */
export async function getProductProfitReport(
  scope: ScopedDateRange
): Promise<ProductProfitReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const allProducts = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
  });

  const products = applyBrandScope(allProducts, scope.brandId);
  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const productIds = products.map((product) => String(product.id));
  const supplierArticles = products.map((product) => product.supplier_article);

  const [orders, sales, finance, ads, costHistory] = await Promise.all([
    fetchOrdersInRange(scope, client, { productIds }),
    fetchSalesInRange(scope, client, { productIds }),
    fetchFinanceInRange(scope, client, { productIds }),
    fetchAdsInRange(scope, client, { productIds, supplierArticles }),
    fetchCostHistory(scope.marketplaceAccountId, client, { productIds }),
  ]);

  const profitabilityRows = buildProductProfitabilityRows({
    products,
    orders,
    sales,
    finance,
    ads,
    costHistory,
  });

  const rows = profitabilityRows.map((row) => {
    const product = productsById.get(row.productId);
    return {
      productId: row.productId,
      sku: product?.nm_id ? String(product.nm_id) : "—",
      model: row.modelCode,
      brand: row.brandName,
      revenue: row.revenue,
      orders: row.orders,
      purchases: row.purchases,
      marketplaceFee: row.marketplaceFees,
      logistics: row.logistics,
      advertising: row.advertising,
      productCost: row.productCost,
      netProfit: row.finalNetProfit,
      marginPercent: calculateNetMarginPercent(row.revenue, row.finalNetProfit),
    };
  });

  logScopeAudit("Reports / Product Profit", scope, scope, {
    orders: orders.length,
    sales: sales.length,
    finance: finance.length,
    ads: ads.length,
  });

  return { scope, rows };
}
