import * as XLSX from "xlsx";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type {
  BusinessExecutiveSummaryData,
  BusinessFinancialSummaryData,
  BusinessInventorySummaryData,
  BusinessProductRankRow,
  BusinessProductSummaryData,
  ReportPayload,
} from "@/lib/reports/report-engine-types";

type SheetCell = string | number | null;

function money(value: number, currency: string): string {
  return formatCurrency(value, currency);
}

function qty(value: number): string {
  return formatNumber(value);
}

function pct(value: number): string {
  return formatPercent(value, 1);
}

function appendSheet(
  workbook: XLSX.WorkBook,
  name: string,
  rows: SheetCell[][],
  colWidths?: number[]
) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  if (colWidths) {
    worksheet["!cols"] = colWidths.map((wch) => ({ wch }));
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}

function buildCoverSheet(payload: ReportPayload): SheetCell[][] {
  const identity = payload.identity;
  return [
    ["Business Report"],
    [],
    ["Report Name", identity.reportName],
    ["Company", identity.company],
    ["Marketplace", identity.marketplace],
    ["Account", identity.account],
    [
      "Reporting Period",
      `${identity.reportingPeriod.from} → ${identity.reportingPeriod.to}`,
    ],
    ["Period Preset", identity.reportingPeriod.presetLabel ?? "Custom Date Range"],
    ["Currency", identity.currency],
    ["Generated At", identity.generatedAt],
    [
      "Last Successful Synchronization",
      identity.lastSuccessfulSyncAt ?? "—",
    ],
    ["Template Version", identity.templateVersion],
  ];
}

function buildExecutiveSheet(
  data: BusinessExecutiveSummaryData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Executive Summary"], [], ["No executive metrics available."]];
  }

  return [
    ["Executive Summary"],
    [],
    ["Metric", "Value"],
    ["Revenue", money(data.revenue, currency)],
    ["Net Profit", money(data.netProfit, currency)],
    ["Orders", qty(data.orders)],
    ["Purchases", qty(data.purchases)],
    ["Conversion", pct(data.conversionRate)],
    ["Return Rate", pct(data.returnRate)],
    ["Marketplace Costs", money(data.marketplaceCosts, currency)],
    ["Units Sold", qty(data.unitsSold)],
    ["Units Returned", qty(data.unitsReturned)],
  ];
}

function buildFinancialSheet(
  data: BusinessFinancialSummaryData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Financial Summary"], [], ["No financial metrics available."]];
  }

  const rows: SheetCell[][] = [
    ["Financial Summary"],
    [],
    ["Metric", "Value"],
    ["Revenue", money(data.revenue, currency)],
    ["Product Cost", money(data.productCost, currency)],
    ["Marketplace Fees", money(data.marketplaceFees, currency)],
    ["Commission", money(data.commission, currency)],
    ["Logistics", money(data.logistics, currency)],
    ["Return Logistics", money(data.returnLogistics, currency)],
    ["Storage", money(data.storage, currency)],
    ["Advertising", money(data.advertising, currency)],
    ["Penalties", money(data.penalties, currency)],
    ["Other Expenses", money(data.otherExpenses, currency)],
    ["Net Profit", money(data.netProfit, currency)],
    [],
    ["WB Settlement"],
    ["Available", data.wbSettlement.available ? "Yes" : "No"],
    ["Data Source", data.wbSettlement.dataSource],
  ];

  if (data.wbSettlement.available) {
    rows.push(
      ["Net For Pay", money(data.wbSettlement.netForPay, currency)],
      ["Settlement Logistics", money(data.wbSettlement.logistics, currency)],
      ["Settlement Storage", money(data.wbSettlement.storage, currency)],
      ["Settlement Penalties", money(data.wbSettlement.penalties, currency)],
      ["Deductions", money(data.wbSettlement.deductions, currency)],
      ["Acceptance", money(data.wbSettlement.acceptance, currency)],
      ["Settlement", money(data.wbSettlement.settlement, currency)]
    );
  }

  return rows;
}

function rankTable(
  title: string,
  rows: BusinessProductRankRow[],
  valueHeader: string,
  formatValue: (value: number) => string
): SheetCell[][] {
  const out: SheetCell[][] = [
    [title],
    ["Rank", "SKU", "Product", valueHeader],
  ];
  if (rows.length === 0) {
    out.push(["—", "—", "No rows", "—"]);
    return out;
  }
  for (const row of rows) {
    out.push([row.rank, row.sku, row.productName, formatValue(row.value)]);
  }
  return out;
}

function buildProductSheet(
  data: BusinessProductSummaryData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Product Summary"], [], ["No product metrics available."]];
  }

  const blocks = [
    rankTable("Top Revenue", data.topRevenue, "Revenue", (v) => money(v, currency)),
    [[]],
    rankTable("Top Profit", data.topProfit, "Final Net Profit", (v) => money(v, currency)),
    [[]],
    rankTable("Best Conversion", data.bestConversion, "Conversion %", pct),
    [[]],
    rankTable("Most Returned", data.mostReturned, "Units Returned", qty),
    [[]],
    rankTable("Most Sold", data.mostSold, "Purchases", qty),
  ];

  return [["Product Summary"], [], ...blocks.flat()];
}

function buildInventorySheet(
  data: BusinessInventorySummaryData | undefined,
  currency: string
): SheetCell[][] {
  if (!data) {
    return [["Inventory Summary"], [], ["No inventory metrics available."]];
  }

  const rows: SheetCell[][] = [
    ["Inventory Summary"],
    [],
    ["Stock Overview (from Inventory module)"],
    ["SKU", "Product", "Current Stock", "Days of Inventory", "Status"],
  ];

  if (data.stockRows.length === 0) {
    rows.push(["—", "No stock rows", "—", "—", "—"]);
  } else {
    for (const row of data.stockRows) {
      rows.push([
        row.sku,
        row.productName,
        qty(row.currentStock),
        row.daysLeft == null ? "—" : qty(row.daysLeft),
        row.status,
      ]);
    }
  }

  rows.push(
    [],
    ["Warehouse Distribution (from Warehouse Sales)"],
    [
      "Warehouse",
      "Orders",
      "Units",
      "Revenue",
      "Order Share %",
      "Revenue Share %",
    ]
  );

  if (data.warehouseDistribution.length === 0) {
    rows.push(["—", "—", "—", "—", "—", "—"]);
  } else {
    for (const row of data.warehouseDistribution) {
      rows.push([
        row.warehouse,
        qty(row.orders),
        qty(row.units),
        money(row.revenue, currency),
        pct(row.orderSharePercent),
        pct(row.revenueSharePercent),
      ]);
    }
  }

  if (data.notes.length > 0) {
    rows.push([], ["Notes"]);
    for (const note of data.notes) {
      rows.push([note]);
    }
  }

  return rows;
}

/**
 * Sprint 7.2 Business Report workbook — multi-sheet management pack.
 * Presentation only; values come from ReportPayload sections.
 */
export function buildBusinessReportWorkbook(payload: ReportPayload): ArrayBuffer {
  const currency = payload.identity.currency || "RUB";
  const executive = payload.sections.find((s) => s.id === "executive-summary")
    ?.data as BusinessExecutiveSummaryData | undefined;
  const financial = payload.sections.find((s) => s.id === "financial-summary")
    ?.data as BusinessFinancialSummaryData | undefined;
  const product = payload.sections.find((s) => s.id === "product-summary")
    ?.data as BusinessProductSummaryData | undefined;
  const inventory = payload.sections.find((s) => s.id === "inventory-summary")
    ?.data as BusinessInventorySummaryData | undefined;

  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, "Cover", buildCoverSheet(payload), [36, 48]);
  appendSheet(workbook, "Executive Summary", buildExecutiveSheet(executive, currency), [
    28,
    24,
  ]);
  appendSheet(workbook, "Financial Summary", buildFinancialSheet(financial, currency), [
    28,
    24,
  ]);
  appendSheet(workbook, "Product Summary", buildProductSheet(product, currency), [
    8,
    18,
    40,
    18,
  ]);
  appendSheet(workbook, "Inventory Summary", buildInventorySheet(inventory, currency), [
    22,
    36,
    14,
    16,
    14,
    14,
  ]);

  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
