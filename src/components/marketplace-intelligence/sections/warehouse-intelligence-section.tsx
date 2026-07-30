"use client";

import type { WarehouseIntelligenceData } from "@/lib/reporting/sections/warehouse-intelligence";
import type { ReportSection } from "@/lib/reporting/types";
import {
  ReportCallout,
  ReportKpiGrid,
  ReportSectionFrame,
} from "@/components/reports/preview/report-section-frame";
import { ReportSubsection } from "@/components/reports/preview/report-layout";
import { ReportTable } from "@/components/reports/preview/report-table";
import { ReportEmptyState } from "@/components/reports/preview/report-empty-state";
import {
  reportMoney,
  reportNumber,
  reportPercent,
} from "@/components/reports/preview/report-format";
import { WarehouseDistributionPanel } from "@/components/inventory/warehouse-distribution-panel";

export function WarehouseIntelligenceSectionView({
  section,
  currency,
}: {
  section: ReportSection<WarehouseIntelligenceData>;
  currency: string;
}) {
  const d = section.data;
  const distributionRows = d.rows.map((r) => ({
    warehouse: r.warehouse,
    orders: r.orders,
    unitsSold: r.unitsSold,
    revenue: r.revenue,
    salesSharePercent: r.orderSharePercent,
  }));

  return (
    <ReportSectionFrame
      sectionId="warehouse-intelligence"
      title="Warehouse Intelligence"
      description="Where sales concentrate — align stock depth to warehouse contribution."
    >
      <ReportKpiGrid
        columns={4}
        items={[
          {
            label: "Warehouses",
            value: reportNumber(d.totals.warehouseCount),
            emphasis: "primary",
          },
          {
            label: "Sales",
            value: reportMoney(d.totals.revenue, currency),
            emphasis: "primary",
          },
          {
            label: "Units Sold",
            value: reportNumber(d.totals.unitsSold),
            emphasis: "primary",
          },
          {
            label: "Orders",
            value: reportNumber(d.totals.orders),
            emphasis: "primary",
          },
          {
            label: "Inventory Value",
            value: "Not available",
            hint: "Not exposed by current inventory services",
          },
        ]}
      />

      {!d.available ? (
        <div className="mt-5">
          <ReportEmptyState
            variant="unavailable"
            hint={
              d.notes[0] ??
              "Warehouse sales analytics unavailable for this Report Scope."
            }
          />
        </div>
      ) : (
        <>
          <ReportSubsection
            title="Warehouse Sales"
            description="Order share by warehouse (sales attribution — not stock distribution)"
          >
            <WarehouseDistributionPanel rows={distributionRows} />
          </ReportSubsection>

          <ReportSubsection title="Sales by warehouse">
            <ReportTable
              stickyHeader
              defaultSortKey="revenue"
              minWidthClassName="min-w-[720px]"
              rowKey={(r) => r.warehouse}
              columns={[
                {
                  key: "warehouse",
                  header: "Warehouse",
                  cell: (r) => r.warehouse,
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
                  key: "units",
                  header: "Units Sold",
                  align: "right",
                  sortable: true,
                  sortValue: (r) => r.unitsSold,
                  cell: (r) => reportNumber(r.unitsSold),
                },
                {
                  key: "revenue",
                  header: "Sales",
                  align: "right",
                  sortable: true,
                  sortValue: (r) => r.revenue,
                  cell: (r) => reportMoney(r.revenue, currency),
                },
                {
                  key: "orderShare",
                  header: "Order Share %",
                  align: "right",
                  sortable: true,
                  sortValue: (r) => r.orderSharePercent,
                  cell: (r) => reportPercent(r.orderSharePercent),
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
              rows={d.rows}
            />
          </ReportSubsection>
        </>
      )}

      {d.notes.length > 0 ? (
        <ReportCallout title="Coverage notes">
          <ul className="list-disc space-y-1 pl-4">
            {d.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </ReportCallout>
      ) : null}
    </ReportSectionFrame>
  );
}
