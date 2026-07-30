import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import {
  buildMarketplaceFeesPresentationFromFinance,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
  type FinanceCategorySummary,
} from "@/lib/finance-rollup";
import { computeProductCost } from "@/lib/product-cost";
import { buildModelBProfitMetrics } from "@/lib/financial-engine";
import { buildModelCProfitMetrics } from "@/lib/profit-engine-model-c";
import {
  buildNetFinishedPriceFromDb,
  buildNetForPayFromDb,
} from "@/lib/sales-revenue-resolution";
import {
  sumAcceptanceFromFinance,
  sumNetForPayFromFinance,
} from "@/lib/wb-settlement";
import {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import { resolveNetSales } from "@/services/sales-revenue-service";
import { getWbSettlementMetrics } from "@/services/wb-settlement-service";
import type { ModelBProfitMetrics, ModelCProfitMetrics, ScopedDateRange } from "@/types/database";

export type FinanceCategoryReport = {
  scope: ScopedDateRange;
  categories: FinanceCategorySummary;
  modelBProfit: ModelBProfitMetrics;
  modelCProfit: ModelCProfitMetrics;
  marketplaceFeesPresentation: ReturnType<typeof buildMarketplaceFeesPresentationFromFinance>;
};

/**
 * Read-only analytical queries for Reports Center.
 * No sync, no mutations, no read-time categorization — consumes persisted finance_category only.
 */
export async function getFinanceCategoryReport(
  scope: ScopedDateRange
): Promise<FinanceCategoryReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const products = await fetchProductsWithRelations(scope.marketplaceAccountId, client, {
    brandId: scope.brandId,
  });
  const productIds = products.map((product) => String(product.id));
  const supplierArticles = products.map((product) => product.supplier_article);
  const [sales, finance, ads, costHistory] = await Promise.all([
    fetchSalesInRange(scope, client, { productIds }),
    fetchFinanceInRange(scope, client, { productIds }),
    fetchAdsInRange(scope, client, { productIds, supplierArticles }),
    fetchCostHistory(scope.marketplaceAccountId, client, { productIds }),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const financeTotals = rollupCategoriesToProfitBuckets(finance);
  const productCost = computeProductCost(sales, costHistory, latestCostByProductId);
  const advertising = ads.reduce((sum, ad) => sum + ad.spend, 0);
  const presentation = buildMarketplaceFeesPresentationFromFinance(
    finance,
    financeTotals.commission
  );
  const totalLogistics = financeTotals.logistics + financeTotals.return_logistics;
  const netSalesResolution = await resolveNetSales(scope, sales);
  const categorySummary = summarizeFinanceByCategory(finance);
  const modelBProfit = buildModelBProfitMetrics(netSalesResolution, {
    salesForPay: buildNetForPayFromDb(sales),
    financeNetForPay: sumNetForPayFromFinance(finance),
    acquiring: categorySummary.ACQUIRING,
    logistics: totalLogistics,
    storage: financeTotals.storage,
    penalties: financeTotals.penalty,
    adjustments: presentation.accountAdjustments,
    acceptance: sumAcceptanceFromFinance(finance),
    productCost,
    advertising,
    customerPaid: buildNetFinishedPriceFromDb(sales),
  });
  const wbSettlement = await getWbSettlementMetrics(scope, finance, totalLogistics);
  const settlementAvailable = wbSettlement.availability?.available !== false;
  const modelCProfit = settlementAvailable
    ? buildModelCProfitMetrics({
        netForPay: wbSettlement.netForPay,
        marketplaceFees: presentation.marketplaceFees,
        logistics: totalLogistics,
        storage: wbSettlement.storage,
        penalties: wbSettlement.penalties,
        deductions: wbSettlement.deductions,
        acceptance: wbSettlement.acceptance,
        productCost,
        advertising,
      })
    : {
        revenue: 0,
        marketplaceFees: 0,
        logistics: 0,
        storage: 0,
        penalties: 0,
        deductions: 0,
        acceptance: 0,
        productCost: 0,
        advertising: 0,
        netProfit: 0,
      };

  return {
    scope,
    categories: summarizeFinanceByCategory(finance),
    modelBProfit,
    modelCProfit,
    marketplaceFeesPresentation: presentation,
  };
}
