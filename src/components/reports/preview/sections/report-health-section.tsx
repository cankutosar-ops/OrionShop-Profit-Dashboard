import type { ReportHealthData } from "@/lib/reporting/sections/report-health";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { reportNumber, reportText } from "@/components/reports/preview/report-format";

export function ReportHealthSection({
  section,
}: {
  section: ReportSection<ReportHealthData>;
}) {
  const d = section.data;
  const period = d.reportingPeriod;
  const sync = d.lastFinanceSync;

  const rows: Array<[string, string]> = [
    [
      "Reporting period",
      `${period.from} → ${period.to}${
        period.presetLabel ? ` · ${period.presetLabel}` : ""
      } (${reportNumber(period.dayCount)} days)`,
    ],
    ["Last successful sync", reportText(sync.lastSuccessfulSyncAt)],
    ["Last sync status", reportText(sync.lastSyncStatus)],
    ["Finance latest operation", reportText(sync.financeLatestOperationDate)],
    [
      "Finance gap days",
      sync.financeGapDays == null ? "—" : reportNumber(sync.financeGapDays),
    ],
    [
      "Finance recovery needed",
      sync.financeRecoveryNeeded ? "Yes" : "No",
    ],
    [
      "Settlement coverage",
      d.settlementCoverage.available
        ? `Available · ${d.settlementCoverage.source}`
        : `Unavailable · ${reportText(d.settlementCoverage.note)}`,
    ],
    [
      "Inventory coverage",
      d.inventoryCoverage.available
        ? `Available · ${reportNumber(d.inventoryCoverage.modelCount)} models`
        : reportText(d.inventoryCoverage.note),
    ],
    [
      "Lifecycle status",
      reportText(d.verificationStatus.lifecycleStatus),
    ],
    [
      "Sample data",
      d.verificationStatus.isSampleData ? "Yes" : "No",
    ],
    ["Calculation model", d.calculationModel],
    ["Financial Engine", d.financialEngineVersion],
  ];

  return (
    <ReportSectionFrame
      sectionId="report-health"
      title={section.title}
      description={section.description}
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {d.verificationStatus.warnings.length > 0 ? (
        <ReportCallout title="Warnings">
          <ul className="list-disc space-y-1 pl-4">
            {d.verificationStatus.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </ReportCallout>
      ) : null}
    </ReportSectionFrame>
  );
}
