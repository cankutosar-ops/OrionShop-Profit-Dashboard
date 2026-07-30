import type { TrendsData } from "@/lib/reporting/sections/trends";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import {
  reportMoney,
  reportNumber,
} from "@/components/reports/preview/report-format";

export function TrendAnalysisSection({
  section,
  currency,
}: {
  section: ReportSection<TrendsData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="trends"
      title={section.title}
      description={section.description}
    >
      <div className="space-y-6">
        {(
          [
            ["Daily", d.daily],
            ["Weekly", d.weekly],
            ["Monthly", d.monthly],
          ] as const
        ).map(([label, rows]) => (
          <div key={label} className="break-inside-avoid">
            <h3 className="mb-2 text-sm font-semibold">{label}</h3>
            <ReportTable
              compact
              maxRows={label === "Daily" ? 31 : undefined}
              rowKey={(r) => `${label}-${r.key}`}
              columns={[
                { key: "period", header: "Period", cell: (r) => r.label },
                {
                  key: "revenue",
                  header: "Sales",
                  align: "right",
                  cell: (r) => reportMoney(r.revenue, currency),
                },
                {
                  key: "profit",
                  header: "Profit",
                  align: "right",
                  cell: (r) => reportMoney(r.profit, currency),
                },
                {
                  key: "orders",
                  header: "Orders",
                  align: "right",
                  cell: (r) => reportNumber(r.ordersCount),
                },
                {
                  key: "purchases",
                  header: "Buyout",
                  align: "right",
                  cell: (r) => reportNumber(r.purchasesCount),
                },
              ]}
              rows={rows}
            />
          </div>
        ))}
      </div>
    </ReportSectionFrame>
  );
}
