import type { CoverData } from "@/lib/reporting/sections/cover";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { reportText } from "@/components/reports/preview/report-format";

export function CoverSection({
  section,
}: {
  section: ReportSection<CoverData>;
}) {
  const d = section.data;
  const rows: Array<[string, string]> = [
    ["Company", d.company.name],
    ["Marketplace", d.marketplace.marketplace],
    ["Account", d.marketplace.accountName],
    [
      "Brand filter",
      d.brandFilter.name ?? (d.brandFilter.id ? d.brandFilter.id : "All brands"),
    ],
    [
      "Reporting period",
      `${d.period.from} → ${d.period.to}${
        d.period.presetLabel ? ` · ${d.period.presetLabel}` : ""
      }`,
    ],
    ["Currency", d.currency],
    ["Generated at", d.generatedAt],
    ["Report version", String(d.reportVersion)],
    ["Locale", d.locale],
  ];

  return (
    <ReportSectionFrame
      sectionId="cover"
      title={d.reportName}
      description="Cover · identity for the selected reporting period"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Orion Shop · Management Report
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium">{reportText(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </ReportSectionFrame>
  );
}
