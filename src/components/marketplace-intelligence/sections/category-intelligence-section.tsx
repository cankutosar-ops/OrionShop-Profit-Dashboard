"use client";

import type { CategoryIntelligenceData } from "@/lib/reporting/sections/category-intelligence";
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
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";

function RankBoard({
  title,
  rows,
  format,
  currency,
}: {
  title: string;
  rows: Array<{ rank: number; categoryName: string; value: number }>;
  format: "currency" | "percent";
  currency: string;
}) {
  return (
    <ReportSubsection title={title} className="mt-0">
      <ReportTable
        compact
        stickyHeader
        emptyMessage="No categories in this board."
        rowKey={(r) => `${title}-${r.rank}-${r.categoryName}`}
        minWidthClassName="min-w-[280px]"
        columns={[
          {
            key: "rank",
            header: "#",
            align: "right",
            cell: (r) => reportNumber(r.rank),
          },
          {
            key: "name",
            header: "Category",
            cell: (r) => r.categoryName,
          },
          {
            key: "value",
            header: "Value",
            align: "right",
            cell: (r) =>
              format === "currency"
                ? reportMoney(r.value, currency)
                : reportPercent(r.value),
          },
        ]}
        rows={rows}
      />
    </ReportSubsection>
  );
}

export function CategoryIntelligenceSection({
  section,
  currency,
}: {
  section: ReportSection<CategoryIntelligenceData>;
  currency: string;
}) {
  const d = section.data;

  return (
    <ReportSectionFrame
      sectionId="category-intelligence"
      title="Category Intelligence"
      description="Which categories deserve investment — and which only look good on Revenue."
    >
      <ReportKpiGrid
        columns={4}
        items={[
          {
            label: "Categories",
            value: reportNumber(d.totals.categoryCount),
            emphasis: "primary",
          },
          {
            label: "Revenue",
            value: reportMoney(d.totals.revenue, currency),
            emphasis: "primary",
          },
          {
            label: "Net Profit",
            value: reportMoney(d.totals.netProfit, currency),
            emphasis: "primary",
          },
          {
            label: "Orders",
            value: reportNumber(d.totals.orders),
            emphasis: "primary",
          },
        ]}
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <RankBoard
          title="Highest revenue"
          rows={d.boards.topByRevenue}
          format="currency"
          currency={currency}
        />
        <RankBoard
          title="Top categories (profit)"
          rows={d.boards.topByProfit}
          format="currency"
          currency={currency}
        />
        <RankBoard
          title="Lowest margin"
          rows={d.boards.lowestMargin}
          format="percent"
          currency={currency}
        />
      </div>

      <ReportSubsection title="Category comparison">
        <ReportTable
          stickyHeader
          defaultSortKey="profit"
          minWidthClassName="min-w-[960px]"
          emptyMessage="No category rows for this Report Scope."
          rowKey={(r) => r.categoryName}
          columns={[
            {
              key: "category",
              header: "Category",
              cell: (r) => r.categoryName,
            },
            {
              key: "revenue",
              header: "Revenue",
              align: "right",
              sortable: true,
              sortValue: (r) => r.revenue,
              cell: (r) => reportMoney(r.revenue, currency),
            },
            {
              key: "profit",
              header: "Net Profit",
              align: "right",
              sortable: true,
              sortValue: (r) => r.netProfit,
              cell: (r) => reportMoney(r.netProfit, currency),
            },
            {
              key: "margin",
              header: "Margin %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.marginPercent,
              cell: (r) => reportPercent(r.marginPercent),
            },
            {
              key: "orders",
              header: "Orders",
              align: "right",
              sortable: true,
              sortValue: (r) => r.orders,
              cell: (r) => reportNumber(r.orders),
            },
            {
              key: "purchases",
              header: "Buyout",
              align: "right",
              sortable: true,
              sortValue: (r) => r.purchases,
              cell: (r) => reportNumber(r.purchases),
            },
            {
              key: "asp",
              header: "Avg Selling Price",
              align: "right",
              sortable: true,
              sortValue: (r) => r.averageSellingPrice,
              cell: (r) =>
                r.averageSellingPrice == null
                  ? "—"
                  : reportMoney(r.averageSellingPrice, currency),
            },
            {
              key: "avgCost",
              header: "Avg Product Cost",
              align: "right",
              sortable: true,
              sortValue: (r) => r.averageProductCost,
              cell: (r) =>
                r.averageProductCost == null
                  ? "—"
                  : reportMoney(r.averageProductCost, currency),
            },
            {
              key: "return",
              header: "Return %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.returnRate,
              cell: (r) => reportPercent(r.returnRate),
            },
            {
              key: "contrib",
              header: "Contribution %",
              align: "right",
              sortable: true,
              sortValue: (r) => r.contributionPercent,
              cell: (r) => reportPercent(r.contributionPercent),
            },
          ]}
          rows={d.categories}
        />
      </ReportSubsection>

      <ReportCallout title="Decision cue" tone="info">
        Invest where Net Profit and Margin align — not where Revenue alone is
        highest. Lowest-margin categories need price or cost action before
        growth spend.
      </ReportCallout>
    </ReportSectionFrame>
  );
}
