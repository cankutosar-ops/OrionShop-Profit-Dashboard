import type { FinancialSummaryData } from "@/lib/reporting/sections/financial-summary";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import { reportMoney, reportText } from "@/components/reports/preview/report-format";

export function FinancialSummarySection({
  section,
  currency,
}: {
  section: ReportSection<FinancialSummaryData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="financial-summary"
      title={section.title}
      description={`${section.description ?? ""} · Engine ${d.engineVersion}`}
    >
      <ReportTable
        rowKey={(row) => row.id}
        defaultSortKey={undefined}
        columns={[
          {
            key: "label",
            header: "Line",
            cell: (row) => row.label,
          },
          {
            key: "amount",
            header: "Amount",
            align: "right",
            sortable: true,
            sortValue: (row) => row.amount,
            cell: (row) => reportMoney(row.amount, currency),
          },
        ]}
        rows={d.lines}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Source: {reportText(d.source)}
      </p>
    </ReportSectionFrame>
  );
}
