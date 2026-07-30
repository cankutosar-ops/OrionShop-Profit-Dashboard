import { isProductAnalyticsV3Candidate } from "@/lib/product-funnel-metrics";
import {
  buildDecisionSimulatorReport,
  type DecisionSimulatorParams,
  type DecisionSimulatorReport,
} from "@/lib/decision-simulator";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing-constants";
import { createServerClient } from "@/lib/supabase/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getProductProfitability } from "@/services/dashboard-service";
import type { ScopedDateRange } from "@/types/database";

export type DecisionSimulatorPageData = {
  range: ScopedDateRange;
  sku: string;
  availableSkus: string[];
  report: DecisionSimulatorReport | null;
};

export async function getDecisionSimulatorPageData(
  scope: ScopedDateRange,
  sku: string,
  targetMarginPercent = DEFAULT_TARGET_MARGIN_PERCENT,
  marketingPercent = DEFAULT_MARKETING_PERCENT
): Promise<DecisionSimulatorPageData | null> {
  const env = getSupabaseEnv();
  if (!env.isConfigured) return null;

  const client = await createServerClient();
  const products = await getProductProfitability(scope, client);
  const candidates = products.filter(isProductAnalyticsV3Candidate);
  const availableSkus = candidates
    .filter((product) => product.unitsSold > 0 && product.revenue > 0)
    .map((product) => product.modelCode)
    .sort();

  const cohortMaxOrders = candidates.reduce(
    (max, product) => Math.max(max, product.orders),
    0
  );

  const normalizedSku = sku.trim().toUpperCase();
  const product =
    candidates.find((item) => item.modelCode.toUpperCase() === normalizedSku) ?? null;

  const params: DecisionSimulatorParams = { targetMarginPercent, marketingPercent };
  const report = product ? buildDecisionSimulatorReport(product, cohortMaxOrders, params) : null;

  return {
    range: scope,
    sku: normalizedSku || availableSkus[0] || "",
    availableSkus,
    report,
  };
}

export type { DecisionSimulatorReport };
