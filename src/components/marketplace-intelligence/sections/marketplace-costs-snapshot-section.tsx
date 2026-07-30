"use client";

import type { MarketplaceCostsData } from "@/lib/reporting/sections/marketplace-costs";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import { ReportTable } from "@/components/reports/preview/report-table";
import {
  reportMoney,
  reportPercent,
} from "@/components/reports/preview/report-format";

/**
 * Cost snapshot for Marketplace Intelligence — same FE cost lines as BI Workspace.
 */
export function MarketplaceCostsSnapshotSection({
  section,
  currency,
}: {
  section: ReportSection<MarketplaceCostsData>;
  currency: string;
}) {
  const d = section.data;
  const sorted = [...d.lines].sort((a, b) => b.amount - a.amount);

  return (
    <ReportSectionFrame
      sectionId="marketplace-costs"
      title="Marketplace Costs"
      description="Largest cost levers on margin — same Financial Engine V4 lines as Business Intelligence."
    >
      <ReportKpiGrid
        columns={3}
        items={[
          {
            label: "Revenue Base",
            value: reportMoney(d.revenueBase, currency),
          },
          {
            label: "Total Costs",
            value: reportMoney(d.totalAmount, currency),
            emphasis: "primary",
          },
          {
            label: "Total % of Revenue",
            value: reportPercent(d.totalPercentOfRevenue),
            emphasis: "primary",
          },
        ]}
      />

      <ReportSubsection title="Cost breakdown">
        <ReportTable
          stickyHeader
          defaultSortKey="amount"
          minWidthClassName="min-w-[420px]"
          rowKey={(r) => r.id}
          columns={[
            {
              key: "cost",
              header: "Cost",
              cell: (r) => r.label,
            },
            {
              key: "amount",
              header: "Amount",
              align: "right",
              sortable: true,
              sortValue: (r) => r.amount,
              cell: (r) => reportMoney(r.amount, currency),
            },
            {
              key: "pct",
              header: "% of Revenue",
              align: "right",
              sortable: true,
              sortValue: (r) => r.percentOfRevenue,
              cell: (r) => reportPercent(r.percentOfRevenue),
            },
          ]}
          rows={sorted}
        />
      </ReportSubsection>

      <ReportCallout title="Decision cue" tone="info">
        Attack the largest % of Revenue line first — typically logistics or
        marketplace fee — before optimizing smaller buckets.
      </ReportCallout>
    </ReportSectionFrame>
  );
}
