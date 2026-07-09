import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { buildLatestCostByProductId } from "@/lib/cost-history-resolution";
import {
  summarizeFinanceByCategory,
  type FinanceCategorySummary,
} from "@/lib/finance-rollup";
import { buildProfitBreakdown } from "@/lib/profit-calculator";
import { buildProfitabilityV2 } from "@/lib/profitability-v2";
import { buildMarketplaceFeesPresentationFromFinance } from "@/lib/finance-rollup";
import {
  fetchAdsInRange,
  fetchCostHistory,
  fetchFinanceInRange,
  fetchProductsWithRelations,
  fetchSalesInRange,
} from "@/services/persisted-query-service";
import type { ProfitBreakdown, ProfitabilityV2Metrics, ScopedDateRange } from "@/types/database";

export type FinanceCategoryReport = {
  scope: ScopedDateRange;
  categories: FinanceCategorySummary;
  breakdown: ProfitBreakdown;
  profitabilityV2: ProfitabilityV2Metrics;
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

  const client = createServerClient();
  const [sales, finance, ads, costHistory, products] = await Promise.all([
    fetchSalesInRange(scope, client),
    fetchFinanceInRange(scope, client),
    fetchAdsInRange(scope, client),
    fetchCostHistory(scope.marketplaceAccountId, client),
    fetchProductsWithRelations(scope.marketplaceAccountId, client),
  ]);

  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const breakdown = buildProfitBreakdown({
    sales,
    finance,
    ads,
    costHistory,
    latestCostByProductId,
    auditRange: scope,
  });

  return {
    scope,
    categories: summarizeFinanceByCategory(finance),
    breakdown,
    profitabilityV2: buildProfitabilityV2(breakdown),
    marketplaceFeesPresentation: buildMarketplaceFeesPresentationFromFinance(
      finance,
      breakdown.commission
    ),
  };
}
