import Link from "next/link";
import { BusinessReportPreview } from "@/components/reports/preview/business-report-preview";
import { ExportBusinessReportButton } from "@/components/reports/export-business-report-button";
import { ReportsHeader } from "@/components/reports/reports-header";
import {
  type PageScopeSearchParamsInput,
  scopeParamsToSearchParams,
} from "@/lib/filter-params";
import { resolveScopedDateRange } from "@/lib/marketplace-scope";
import { buildBusinessReport } from "@/lib/reporting";
import {
  inferPeriodPreset,
  periodPresetLabel,
} from "@/lib/reports/report-period";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<PageScopeSearchParamsInput>;
};

/**
 * Business Intelligence Workspace — renders ReportDocument interactively.
 * Excel export uses the ReportDocument renderer (Sprint 8.0).
 */
export default async function BusinessReportPreviewPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scopeQuery = scopeParamsToSearchParams(params).toString();
  const backHref = scopeQuery ? `/reports?${scopeQuery}` : "/reports";
  const scope = await resolveScopedDateRange(params);
  const preset = inferPeriodPreset(scope.from, scope.to);

  const document = await buildBusinessReport(scope, {
    periodPresetLabel: periodPresetLabel(preset),
  });

  return (
    <>
      <div className="print:hidden">
        <ReportsHeader
          title="Business Intelligence"
          description="Management workspace for the selected Report Scope — powered by ReportDocument"
        />

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={backHref}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to Reports
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <ExportBusinessReportButton
              label="Export Excel"
              variant="primary"
            />
            <p className="text-xs text-muted-foreground">
              Excel mirrors this workspace · PDF in a later sprint
            </p>
          </div>
        </div>
      </div>

      <BusinessReportPreview document={document} />
    </>
  );
}
