import { SmartPricingPanel } from "@/components/analytics/smart-pricing-panel";
import { ProductContextBannerSection } from "@/components/layout/product-context-banner-section";
import { PageHeader } from "@/components/layout/page-header";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing";
import { parseSmartPricingCommissionSettings } from "@/lib/smart-pricing-settings";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import type { PageScopeSearchParamsInput } from "@/lib/filter-params";
import { measureAsync, recordPerfEvent } from "@/lib/perf/perf-recorder";
import { getSmartPricingInputs } from "@/services/smart-pricing-service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<
    PageScopeSearchParamsInput & {
      margin?: string;
      marketing?: string;
      minProductSales?: string;
      minCategorySales?: string;
      commissionWindow?: string;
    }
  >;
};

function parsePercent(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function SmartPricingPage({ searchParams }: PageProps) {
  const started = Date.now();
  const params = await searchParams;
  const scope = await resolveScopedDateRange(params);
  const targetMargin = parsePercent(params.margin, DEFAULT_TARGET_MARGIN_PERCENT);
  const marketing = parsePercent(params.marketing, DEFAULT_MARKETING_PERCENT);
  const commissionSettings = parseSmartPricingCommissionSettings(params);
  const inputs = await measureAsync(
    "server.getSmartPricingInputs",
    "server",
    () => getSmartPricingInputs(scope),
    { route: "/analytics/pricing" }
  );
  recordPerfEvent({
    category: "server",
    name: "server.SmartPricingPage.render",
    durationMs: Date.now() - started,
    route: "/analytics/pricing",
    meta: { products: inputs?.length ?? 0 },
  });

  return (
    <>
      <PageHeader
        title="Smart Pricing"
        description="Forward-looking target price — purchase cost, purchase logistics, and configured commission"
      />

      <ProductContextBannerSection />

      {!inputs ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to use the pricing calculator.
        </div>
      ) : (
        <SmartPricingPanel
          inputs={inputs}
          scopeBrandId={scope.brandId}
          initialTargetMargin={targetMargin}
          initialMarketing={marketing}
          initialCommissionSettings={commissionSettings}
        />
      )}
    </>
  );
}
