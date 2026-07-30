import Link from "next/link";
import { MarketplaceIntelligencePreview } from "@/components/marketplace-intelligence/marketplace-intelligence-preview";
import { ReportsHeader } from "@/components/reports/reports-header";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { buildMarketplaceIntelligence } from "@/lib/reporting";
import {
  inferPeriodPreset,
  periodPresetLabel,
} from "@/lib/reports/report-period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

/**
 * Marketplace Intelligence Workspace — decision support from ReportDocument.
 */
export default async function MarketplaceIntelligencePage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const backHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";
  const scope = await resolveScopedDateRange(params);
  const preset = inferPeriodPreset(scope.from, scope.to);

  const document = await buildMarketplaceIntelligence(scope, {
    periodPresetLabel: periodPresetLabel(preset),
  });

  return (
    <>
      <div className="print:hidden">
        <ReportsHeader
          title="Marketplace Intelligence"
          description="Decision support beyond ordinary Wildberries reports — powered by ReportDocument"
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Reports
          </Link>
          <p className="text-xs text-muted-foreground">
            Categories · Products · Warehouses · Coming Soon modules
          </p>
        </div>
      </div>

      <MarketplaceIntelligencePreview document={document} />
    </>
  );
}
