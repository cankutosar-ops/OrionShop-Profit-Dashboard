import { SmartPricingPanel } from "@/components/analytics/smart-pricing-panel";
import { PageHeader } from "@/components/layout/page-header";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing";
import { getSmartPricingInputs } from "@/services/smart-pricing-service";
import { parseDateRange } from "@/lib/utils";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ from?: string; to?: string; margin?: string; marketing?: string }>;
};

function parsePercent(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default async function SmartPricingPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const range = parseDateRange(params.from, params.to);
  const targetMargin = parsePercent(params.margin, DEFAULT_TARGET_MARGIN_PERCENT);
  const marketing = parsePercent(params.marketing, DEFAULT_MARKETING_PERCENT);
  const inputs = await getSmartPricingInputs(range);

  return (
    <>
      <PageHeader
        title="Smart Pricing"
        description="Operational target price calculator — adjust margin and marketing to see required prices instantly"
      />

      {!inputs ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-12 text-center text-muted-foreground">
          Supabase is not configured. Add credentials to .env.local to use the pricing calculator.
        </div>
      ) : (
        <SmartPricingPanel
          inputs={inputs}
          initialTargetMargin={targetMargin}
          initialMarketing={marketing}
        />
      )}
    </>
  );
}
