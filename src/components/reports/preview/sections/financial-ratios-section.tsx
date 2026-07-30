import type { FinancialRatiosData } from "@/lib/reporting/sections/financial-ratios";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import {
  reportMoney,
  reportPercent,
} from "@/components/reports/preview/report-format";

export function FinancialRatiosSection({
  section,
  currency,
}: {
  section: ReportSection<FinancialRatiosData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="financial-ratios"
      title={section.title}
      description={section.description}
    >
      <ReportTable
        rowKey={(r) => r.id}
        columns={[
          { key: "label", header: "Ratio", cell: (r) => r.label },
          {
            key: "value",
            header: "Value",
            align: "right",
            sortable: true,
            sortValue: (r) => r.value,
            cell: (r) =>
              r.format === "currency"
                ? reportMoney(r.value, currency)
                : reportPercent(r.value),
          },
        ]}
        rows={d.ratios}
      />
    </ReportSectionFrame>
  );
}
