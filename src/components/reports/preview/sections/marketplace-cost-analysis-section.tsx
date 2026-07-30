"use client";

import type { MarketplaceCostsData } from "@/lib/reporting/sections/marketplace-costs";
import type { ReportSection } from "@/lib/reporting/types";
import { DonutChart } from "@/components/charts/donut-chart";
import {
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportTable } from "@/components/reports/preview/report-table";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import {
  reportMoney,
  reportPercent,
} from "@/components/reports/preview/report-format";
import { formatChartValue } from "@/components/charts/chart-tooltip";

export function MarketplaceCostAnalysisSection({
  section,
  currency,
}: {
  section: ReportSection<MarketplaceCostsData>;
  currency: string;
}) {
  const d = section.data;
  const donutSlices = d.lines
    .filter((line) => line.amount > 0)
    .map((line) => ({ name: line.label, value: line.amount }));

  return (
    <ReportSectionFrame
      sectionId="marketplace-costs"
      title="Marketplace Costs"
      description="Marketplace expense breakdown with share of Revenue (Financial Engine V4)."
    >
      <ReportKpiGrid
        columns={3}
        items={[
          {
            label: "Revenue base",
            value: reportMoney(d.revenueBase, currency),
          },
          {
            label: "Total costs",
            value: reportMoney(d.totalAmount, currency),
          },
          {
            label: "Total % of Revenue",
            value: reportPercent(d.totalPercentOfRevenue),
          },
        ]}
      />

      <ReportSubsection
        title="Cost composition"
        description="Fee, logistics, storage, and other marketplace expenses"
      >
        <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-border/60 bg-background/40 p-4">
            <DonutChart
              data={donutSlices}
              centerLabel="Total costs"
              centerValue={formatChartValue(d.totalAmount, "currency", {
                currency,
              })}
              valueFormat="currency"
              height={220}
              legendPlacement="side"
              emptyMessage="No marketplace costs for this period"
            />
          </div>
          <ReportTable
            rowKey={(r) => r.id}
            defaultSortKey="amount"
            stickyHeader
            minWidthClassName="min-w-[420px]"
            columns={[
              { key: "label", header: "Cost", cell: (r) => r.label },
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
            rows={d.lines}
          />
        </div>
      </ReportSubsection>
    </ReportSectionFrame>
  );
}
