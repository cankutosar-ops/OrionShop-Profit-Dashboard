import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { isProductAnalyticsV3Candidate } from "@/lib/product-funnel-metrics";
import {
  buildPricingHealthSummary,
  buildProductPricingHealthRows,
  toPricingHistoricalInputs,
  type PricingHealthSummary,
  type ProductPricingHealthRow,
} from "@/lib/pricing-health";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
  deriveProductPricingInputs,
  type ProductPricingHistoricalInputs,
} from "@/lib/smart-pricing";
import { getProductProfitability } from "@/services/dashboard-service";
import type { ScopedDateRange } from "@/types/database";

export type SmartPricingReport = {
  range: ScopedDateRange;
  targetMarginPercent: number;
  marketingPercent: number;
  /** Raw historical inputs — client can recompute prices without refetch. */
  inputs: ProductPricingHistoricalInputs[];
  rows: ProductPricingHealthRow[];
  summary: PricingHealthSummary;
};

export async function getSmartPricingInputs(
  scope: ScopedDateRange
): Promise<ProductPricingHistoricalInputs[] | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const products = await getProductProfitability(scope, client);

  return products
    .filter(isProductAnalyticsV3Candidate)
    .map(deriveProductPricingInputs)
    .sort((a, b) => a.supplierArticle.localeCompare(b.supplierArticle));
}

/** @deprecated Use getSmartPricingInputs — health/scenario data removed in V3 */
export async function getSmartPricingReport(
  scope: ScopedDateRange,
  targetMarginPercent = DEFAULT_TARGET_MARGIN_PERCENT,
  marketingPercent = DEFAULT_MARKETING_PERCENT
): Promise<SmartPricingReport | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = createServerClient();
  const products = await getProductProfitability(scope, client);
  const rows = buildProductPricingHealthRows(products, targetMarginPercent, marketingPercent);
  const inputs = rows.map(toPricingHistoricalInputs);

  return {
    range: scope,
    targetMarginPercent,
    marketingPercent,
    inputs,
    rows,
    summary: buildPricingHealthSummary(rows),
  };
}

export type { ProductPricingHealthRow, PricingHealthSummary };
