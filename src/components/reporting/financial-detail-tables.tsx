"use client";
import { ReportDataTable } from "./report-data-table";
import { formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import type { PnLLine, PnLPeriodBreakdownRow } from "@/lib/reporting/module/pnl-report";
import type { SettlementLine } from "@/lib/reporting/module/settlement-report";

function pnlColumns(currency: string) {
  return [
    {
      key: "label",
      header: "Line",
      align: "left" as const,
      cell: (row: PnLLine) => (
        <span className={row.isTotal ? "font-semibold" : undefined}>{row.label}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      sortable: true,
      sortValue: (row: PnLLine) => row.amount,
      cell: (row: PnLLine) =>
        row.isPercent
          ? formatKpiPercent(row.amount)
          : formatKpiCurrency(row.amount, currency),
    },
  ];
}

function periodColumns(currency: string) {
  const money = (key: keyof PnLPeriodBreakdownRow, header: string) => ({
    key,
    header,
    align: "right" as const,
    cell: (row: PnLPeriodBreakdownRow) =>
      formatKpiCurrency(Number(row[key]) || 0, currency),
  });
  return [
    {
      key: "label",
      header: "Period",
      align: "left" as const,
      cell: (row: PnLPeriodBreakdownRow) => (
        <span className="font-medium">
          {row.label}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {row.from} → {row.to}
          </span>
        </span>
      ),
    },
    money("grossSales", "Gross Sales"),
    money("returnedSales", "Returns"),
    money("netSales", "Net Sales"),
    money("revenue", "Revenue"),
    {
      key: "marketplaceFees",
      header: "Marketplace Fee",
      align: "right" as const,
      cell: (row: PnLPeriodBreakdownRow) => `${formatKpiCurrency(row.marketplaceFees, currency)}${row.marketplaceFeeStatus === "anomaly" ? " · anomaly" : ""}`,
    },
    money("logistics", "Logistics"),
    money("storage", "Storage"),
    money("productCost", "Product Cost"),
    money("netProfit", "Net Profit"),
  ];
}

const SECTION_LABELS: Record<SettlementLine["section"], string> = {
  sales: "Sales",
  wb: "Wildberries Settlement",
  costs: "Operational Costs",
  result: "Final Result",
};

function settlementColumns(currency: string) {
  return [
    {
      key: "section",
      header: "Section",
      align: "left" as const,
      cell: (row: SettlementLine) => (
        <span className="text-muted-foreground">{SECTION_LABELS[row.section]}</span>
      ),
    },
    {
      key: "label",
      header: "Line",
      align: "left" as const,
      cell: (row: SettlementLine) => (
        <span className={row.isTotal ? "font-semibold" : undefined}>{row.label}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right" as const,
      sortable: true,
      sortValue: (row: SettlementLine) => row.amount,
      cell: (row: SettlementLine) => (
        <span className={row.isTotal ? "font-semibold tabular-nums" : "tabular-nums"}>
          {formatKpiCurrency(row.amount, currency)}
        </span>
      ),
    },
  ];
}


export function PnLLinesTable({rows,currency}:{rows:PnLLine[];currency:string}) {
  return <ReportDataTable columns={pnlColumns(currency)} rows={rows} rowKey={row=>row.id} />;
}
export function PnLPeriodsTable({rows,currency}:{rows:PnLPeriodBreakdownRow[];currency:string}) {
  return <ReportDataTable columns={periodColumns(currency)} rows={rows} rowKey={row=>row.label+':'+row.from+':'+row.to} />;
}
export function SettlementLinesTable({rows,currency}:{rows:SettlementLine[];currency:string}) {
  return <ReportDataTable columns={settlementColumns(currency)} rows={rows} rowKey={row=>row.id} />;
}
