"use client";

import { ReportDataTable, type ReportTableColumn } from "@/components/reporting/report-data-table";
import { formatKpiCount, formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { cn } from "@/lib/utils";
import type { ProductProfitReportRow } from "@/lib/reporting/module/product-profit-report";

type ProductProfitReportTableProps = {
  rows: ProductProfitReportRow[];
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

export function ProductProfitReportTable({
  rows,
  currency = "RUB",
}: ProductProfitReportTableProps) {
  const columns: ReportTableColumn<ProductProfitReportRow>[] = [
    {
      key: "sku",
      header: "SKU",
      align: "left",
      sortable: true,
      sortValue: (row) => row.sku,
      cell: (row) => <span className="font-medium">{row.sku}</span>,
      minWidth: "7rem",
    },
    {
      key: "productName",
      header: "Product Name",
      align: "left",
      sortable: true,
      sortValue: (row) => row.productName,
      cell: (row) => (
        <span className="max-w-[14rem] truncate" title={row.productName}>
          {row.productName}
        </span>
      ),
      minWidth: "10rem",
    },
    {
      key: "brand",
      header: "Brand",
      align: "left",
      sortable: true,
      sortValue: (row) => row.brand,
      cell: (row) => row.brand,
    },
    {
      key: "category",
      header: "Category",
      align: "left",
      sortable: true,
      sortValue: (row) => row.category,
      cell: (row) => row.category,
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
      key: "unitsReturned",
      header: "Returned",
      align: "right",
      sortable: true,
      sortValue: (row) => row.unitsReturned,
      cell: (row) => (
        <span className="tabular-nums">{formatKpiCount(row.unitsReturned)}</span>
      ),
    },
    {
      key: "netUnits",
      header: "Net Units",
      align: "right",
      sortable: true,
      sortValue: (row) => row.netUnits,
      cell: (row) => (
        <span className="tabular-nums">{formatKpiCount(row.netUnits)}</span>
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
      key: "marketplaceFees",
      header: "Marketplace Fee",
      align: "right",
      sortable: true,
      sortValue: (row) => row.marketplaceFees,
      cell: (row) => money(row.marketplaceFees, currency),
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
      key: "penalties",
      header: "Penalties",
      align: "right",
      sortable: true,
      sortValue: (row) => row.penalties,
      cell: (row) => money(row.penalties, currency),
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
      key: "estimatedTax",
      header: "Est. Tax",
      align: "right",
      sortable: true,
      sortValue: (row) => row.estimatedTax,
      cell: (row) => money(row.estimatedTax, currency),
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
      header: "Margin %",
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
      rowKey={(row) => row.productId}
      emptyMessage="No product profitability rows for this scope."
      defaultSortKey="netProfit"
      defaultSortDir="desc"
      compact
      minWidthClassName="min-w-[1600px]"
    />
  );
}
