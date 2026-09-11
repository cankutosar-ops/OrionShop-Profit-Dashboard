"use client";

import { ReportDataTable, type ReportTableColumn } from "@/components/reporting/report-data-table";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { cn } from "@/lib/utils";
import type {
  GroupPerformanceDimension,
  GroupPerformanceRow,
} from "@/lib/reporting/module/group-performance-report";

type GroupPerformanceReportTableProps = {
  rows: GroupPerformanceRow[];
  dimension: GroupPerformanceDimension;
  currency?: string;
};

function money(value: number, currency: string) {
  return <span className="tabular-nums">{formatKpiCurrency(value, currency)}</span>;
}

function profitCell(value: number, currency: string) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0 && "text-emerald-700 dark:text-emerald-400",
        value < 0 && "text-destructive"
      )}
    >
      {formatKpiCurrency(value, currency)}
    </span>
  );
}

export function GroupPerformanceReportTable({
  rows,
  dimension,
  currency = "RUB",
}: GroupPerformanceReportTableProps) {
  const nameHeader = dimension === "category" ? "Category" : "Brand";

  const columns: ReportTableColumn<GroupPerformanceRow>[] = [
    {
      key: "name",
      header: nameHeader,
      align: "left",
      sortable: true,
      sortValue: (row) => row.name,
      cell: (row) => <span className="font-medium">{row.name}</span>,
      minWidth: "8rem",
    },
    {
      key: "productCount",
      header: "Products",
      align: "right",
      sortable: true,
      sortValue: (row) => row.productCount,
      cell: (row) => (
        <span className="tabular-nums">{formatKpiCount(row.productCount)}</span>
      ),
    },
    {
      key: "unitsSold",
      header: "Units Sold",
      align: "right",
      sortable: true,
      sortValue: (row) => row.unitsSold,
      cell: (row) => (
        <span className="tabular-nums">{formatKpiCount(row.unitsSold)}</span>
      ),
    },
    {
      key: "netSales",
      header: "Net Sales",
      align: "right",
      sortable: true,
      sortValue: (row) => row.netSales,
      cell: (row) => money(row.netSales, currency),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      sortable: true,
      sortValue: (row) => row.revenue,
      cell: (row) => money(row.revenue, currency),
    },
    {
      key: "productCost",
      header: "Product Cost",
      align: "right",
      sortable: true,
      sortValue: (row) => row.productCost,
      cell: (row) => money(row.productCost, currency),
    },
    {
      key: "marketplaceFees",
      header: "Marketplace Fees",
      align: "right",
      sortable: true,
      sortValue: (row) => row.marketplaceFees,
      cell: (row) => money(row.marketplaceFees, currency),
    },
    {
      key: "logistics",
      header: "Logistics",
      align: "right",
      sortable: true,
      sortValue: (row) => row.logistics,
      cell: (row) => money(row.logistics, currency),
    },
    {
      key: "storage",
      header: "Storage",
      align: "right",
      sortable: true,
      sortValue: (row) => row.storage,
      cell: (row) => money(row.storage, currency),
    },
    {
      key: "adjustments",
      header: "Adjustments",
      align: "right",
      sortable: true,
      sortValue: (row) => row.adjustments,
      cell: (row) => money(row.adjustments, currency),
    },
    {
      key: "advertising",
      header: "Advertising",
      align: "right",
      sortable: true,
      sortValue: (row) => row.advertising,
      cell: (row) => money(row.advertising, currency),
    },
    {
      key: "netProfit",
      header: "Net Profit",
      align: "right",
      sortable: true,
      sortValue: (row) => row.netProfit,
      cell: (row) => profitCell(row.netProfit, currency),
    },
    {
      key: "netMarginPercent",
      header: "Net Margin %",
      align: "right",
      sortable: true,
      sortValue: (row) => row.netMarginPercent,
      cell: (row) => (
        <span className="tabular-nums">{formatKpiPercent(row.netMarginPercent)}</span>
      ),
    },
    {
      key: "roiPercent",
      header: "ROI",
      align: "right",
      sortable: true,
      sortValue: (row) => row.roiPercent,
      cell: (row) => (
        <span className="tabular-nums">
          {row.roiPercent == null ? "—" : formatKpiPercent(row.roiPercent)}
        </span>
      ),
    },
  ];

  return (
    <ReportDataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.groupKey}
      emptyMessage={`No ${dimension} profitability rows for this scope.`}
      defaultSortKey="netProfit"
      defaultSortDir="desc"
      compact
      minWidthClassName="min-w-[1100px]"
    />
  );
}
