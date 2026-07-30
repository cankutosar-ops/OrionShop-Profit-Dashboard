"use client";

import type { AppendixSectionData } from "@/lib/reporting/sections/appendix";
import type { CoverData } from "@/lib/reporting/sections/cover";
import type { ReportHealthData } from "@/lib/reporting/sections/report-health";
import type { ReportAppendix, ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import { reportText } from "@/components/reports/preview/report-format";

function MetaList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="space-y-2.5 text-sm">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col gap-0.5 sm:flex-row sm:gap-3"
        >
          <dt className="min-w-[7.5rem] shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AppendixSectionView({
  section,
  documentAppendix,
  cover,
  health,
}: {
  section: ReportSection<AppendixSectionData>;
  documentAppendix: ReportAppendix;
  cover?: ReportSection<CoverData> | null;
  health?: ReportSection<ReportHealthData> | null;
}) {
  const d = section.data;
  const coverData = cover?.data;
  const healthData = health?.data;

  return (
    <ReportSectionFrame
      sectionId="appendix"
      title="Appendix"
      description="Identity, definitions, and report health — auditability without cluttering analysis."
    >
      {coverData ? (
        <ReportSubsection title="Report identity" className="mt-0">
          <div className="rounded-xl border border-border/70 bg-background/50 px-3.5 py-3">
            <MetaList
              items={[
                { label: "Report", value: reportText(coverData.reportName) },
                {
                  label: "Company",
                  value: `${reportText(coverData.company.name)} · ${reportText(coverData.marketplace.accountName)}`,
                },
                {
                  label: "Period",
                  value: `${coverData.period.from} → ${coverData.period.to}`,
                },
                {
                  label: "Generated",
                  value: coverData.generatedAt,
                },
              ]}
            />
          </div>
        </ReportSubsection>
      ) : null}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <ReportSubsection title="Filters" className="mt-0">
          <div className="rounded-xl border border-border/70 bg-background/50 px-3.5 py-3">
            <MetaList
              items={[
                {
                  label: "Company",
                  value: reportText(d.filters.companyName),
                },
                {
                  label: "Account",
                  value: reportText(d.filters.marketplaceAccountName),
                },
                {
                  label: "Marketplace",
                  value: reportText(d.filters.marketplace),
                },
                {
                  label: "Brand",
                  value: reportText(
                    d.filters.brandName ??
                      (d.filters.brandId ? d.filters.brandId : "All")
                  ),
                },
                {
                  label: "Period",
                  value: `${d.filters.periodFrom} → ${d.filters.periodTo}`,
                },
              ]}
            />
          </div>
        </ReportSubsection>
        <ReportSubsection title="Model information" className="mt-0">
          <div className="rounded-xl border border-border/70 bg-background/50 px-3.5 py-3">
            <MetaList
              items={[
                {
                  label: "Model",
                  value: reportText(d.calculationModel),
                },
                {
                  label: "Engine",
                  value: reportText(d.financialEngineVersion),
                },
                {
                  label: "Report",
                  value: `v${d.reportMetadata.reportVersion}`,
                },
              ]}
            />
          </div>
        </ReportSubsection>
      </div>

      {healthData ? (
        <ReportSubsection title="Report health">
          <div className="rounded-xl border border-border/70 bg-background/50 px-3.5 py-3">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                Period: {healthData.reportingPeriod.from} →{" "}
                {healthData.reportingPeriod.to}
                {healthData.reportingPeriod.presetLabel
                  ? ` (${healthData.reportingPeriod.presetLabel})`
                  : ""}{" "}
                · {healthData.reportingPeriod.dayCount} days
              </li>
              <li>
                Settlement coverage:{" "}
                {healthData.settlementCoverage.available
                  ? `available (${healthData.settlementCoverage.source})`
                  : "unavailable"}
              </li>
              <li>
                Inventory coverage:{" "}
                {healthData.inventoryCoverage.available
                  ? `${healthData.inventoryCoverage.modelCount} models`
                  : "unavailable"}
              </li>
              <li>Model: {healthData.calculationModel}</li>
              {healthData.verificationStatus.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        </ReportSubsection>
      ) : null}

      {(documentAppendix.definitions?.length ?? 0) > 0 ? (
        <ReportSubsection title="Definitions">
          <dl className="space-y-3 rounded-xl border border-border/70 bg-background/50 px-3.5 py-3">
            {documentAppendix.definitions!.map((def) => (
              <div key={def.term}>
                <dt className="text-sm font-medium text-foreground">
                  {def.term}
                </dt>
                <dd className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                  {def.definition}
                </dd>
              </div>
            ))}
          </dl>
        </ReportSubsection>
      ) : null}

      {(documentAppendix.sourceNotes?.length ?? 0) > 0 ? (
        <ReportCallout title="Source notes">
          <ul className="list-disc space-y-1 pl-4">
            {documentAppendix.sourceNotes!.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </ReportCallout>
      ) : null}

      {(documentAppendix.warnings?.length ?? 0) > 0 ? (
        <ReportCallout title="Appendix warnings" tone="warning">
          <ul className="list-disc space-y-1 pl-4">
            {documentAppendix.warnings!.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </ReportCallout>
      ) : null}
    </ReportSectionFrame>
  );
}
