/**
 * Unified Business Excel renderer — multi-sheet workbook for any selected date range.
 * Presentation only; reuses workbook-kit (same kit as Business Report).
 */

import ExcelJS from "exceljs";
import type {
  PeriodBreakdownRow,
  WeeklyBusinessWorkbookModel,
} from "@/lib/reporting/weekly-business/types";
import { WEEKLY_WORKBOOK_SHEET_NAMES } from "@/lib/reporting/weekly-business/types";
import {
  FONT,
  NUM_FMT,
  addBlankRow,
  addKpiBlock,
  addSectionHeader,
  applyColumnWidths,
  freezeAtRow,
  writeExcelTable,
  writeSheetIntro,
} from "@/lib/reporting/excel/workbook-kit";

const WARN_FILL = {
  type: "pattern" as const,
  pattern: "solid" as const,
  fgColor: { argb: "FFFEE2E2" },
};

function writeWarning(sheet: ExcelJS.Worksheet, message: string | null): void {
  if (!message) return;
  const row = sheet.addRow([message]);
  row.getCell(1).font = { ...FONT.body, bold: true, color: { argb: "FF991B1B" } };
  row.getCell(1).fill = WARN_FILL;
  sheet.mergeCells(row.number, 1, row.number, 4);
  addBlankRow(sheet);
}

function writeEmptyNotice(sheet: ExcelJS.Worksheet): void {
  const row = sheet.addRow(["No data for selected period"]);
  row.getCell(1).font = FONT.subtitle;
  addBlankRow(sheet);
}

function kv(
  sheet: ExcelJS.Worksheet,
  label: string,
  value: string | number | null | undefined,
  numFmt?: string
): void {
  const row = sheet.addRow([label, value ?? "—"]);
  row.getCell(1).font = FONT.label;
  row.getCell(2).font = FONT.body;
  if (typeof value === "number" && numFmt) {
    row.getCell(2).numFmt = numFmt;
  }
}

function periodBreakdownSectionTitle(kind: "month" | "week"): string {
  return kind === "month"
    ? "Period breakdown (calendar months)"
    : "Period breakdown (weeks)";
}

function writeFePeriodBreakdown(
  sheet: ExcelJS.Worksheet,
  rows: PeriodBreakdownRow[],
  kind: "month" | "week",
  tableName: string
): void {
  if (rows.length === 0) return;
  addBlankRow(sheet);
  addSectionHeader(sheet, periodBreakdownSectionTitle(kind));
  writeExcelTable(sheet, {
    name: tableName,
    headers: [
      "Period",
      "From",
      "To",
      "Net Sales",
      "Marketplace Fee",
      "Revenue",
      "Logistics",
      "Storage",
      "Product Cost",
      "Advertising",
      "Estimated Tax",
      "Net Profit",
      "Seller Payout",
      "Orders",
      "Sold Units",
      "Cash Received",
      "Expected WB Payout",
    ],
    rows: rows.map((r) => [
      r.chunk.label,
      r.chunk.from,
      r.chunk.to,
      r.netSales,
      r.marketplaceFee,
      r.revenue,
      r.logistics,
      r.storage,
      r.productCost,
      r.advertising,
      r.estimatedTax,
      r.finalNetProfit,
      r.sellerPayout,
      r.ordersCount,
      r.unitsSold,
      r.cashReceived,
      r.expectedWbPayout,
    ]),
    columnFormats: [
      undefined,
      undefined,
      undefined,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.integer,
      NUM_FMT.integer,
      NUM_FMT.currency,
      NUM_FMT.currency,
    ],
  });
}

export async function renderWeeklyBusinessWorkbook(
  model: WeeklyBusinessWorkbookModel
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OrionShop Profit Dashboard";
  workbook.created = new Date(model.generatedAt);

  buildCoverSheet(workbook, model);
  buildExecutiveSheet(workbook, model);
  buildPnLSheet(workbook, model);
  buildSettlementSheet(workbook, model);
  buildSalesOrdersSheet(workbook, model);
  buildProductSheet(workbook, model);
  buildBrandSheet(workbook, model);
  buildCategorySheet(workbook, model);
  buildGlossarySheet(workbook, model);
  buildReconciliationSheet(workbook, model);
  buildFinanceDetailSheet(workbook, model);
  buildSalesDetailSheet(workbook, model);
  buildCashFlowSheet(workbook, model);

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

export function buildWeeklyWorkbookFilename(
  model: WeeklyBusinessWorkbookModel,
  date = new Date()
): string {
  const day = date.toISOString().split("T")[0];
  const account = model.ctx.tenant.accountName
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 40);
  return `unified-business_${account}_${model.ctx.scope.from}_${model.ctx.scope.to}_${day}.xlsx`;
}

function buildCoverSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.cover);
  const { ctx, dataQuality } = model;

  writeSheetIntro(
    sheet,
    model.reportTitle,
    "Unified Business Excel — commercial & financial workbook for the selected period"
  );
  writeWarning(sheet, dataQuality.financeIncompleteWarning);

  addSectionHeader(sheet, "Report Identity");
  kv(sheet, "Company", ctx.tenant.companyName);
  kv(sheet, "Marketplace Account", ctx.tenant.accountName);
  kv(sheet, "Marketplace", ctx.tenant.marketplaceLabel);
  kv(sheet, "Reporting Period", `${ctx.scope.from} → ${ctx.scope.to}`);
  if (model.periodPresetLabel) kv(sheet, "Period Label", model.periodPresetLabel);
  kv(
    sheet,
    "Period breakdown",
    model.periodBreakdownKind === "none"
      ? "Totals only (single period)"
      : model.periodBreakdownKind === "month"
        ? `Monthly (${model.periodBreakdown.length} periods)`
        : `Weekly (${model.periodBreakdown.length} periods)`
  );
  kv(sheet, "Generated At", model.generatedAt);
  kv(sheet, "Financial Engine", model.financialEngineVersion);
  kv(sheet, "Calculation Model", model.calculationModel);
  addBlankRow(sheet);

  addSectionHeader(sheet, "Data Quality");
  writeWarning(sheet, dataQuality.financeNoDataMessage);
  kv(sheet, "Finance latest operation_date", dataQuality.financeLatestOperationDate);
  kv(sheet, "Finance latest source", dataQuality.financeLatestSource);
  kv(sheet, "Finance rows in selected period", dataQuality.financeRowsInPeriod);
  kv(sheet, "Finance latest in selected period", dataQuality.financeLatestInPeriod);
  kv(sheet, "Selected period end (scope.to)", dataQuality.scopeTo);
  kv(sheet, "Finance gap days", dataQuality.financeGapDays);
  kv(sheet, "Finance complete", dataQuality.financeComplete ? "YES" : "NO");
  kv(sheet, "Affected Finance metrics", dataQuality.affectedFinanceMetrics);
  kv(
    sheet,
    "financeRecoveryNeeded",
    dataQuality.financeRecoveryNeeded ? "YES" : "NO"
  );
  kv(sheet, "Last sync status", dataQuality.lastSyncStatus);
  kv(sheet, "Orders latest date (in period)", dataQuality.ordersLatestDate);
  kv(sheet, "Sales latest date (in period)", dataQuality.salesLatestDate);
  kv(sheet, "Finance latest date", dataQuality.financeLatestDate);
  kv(sheet, "Sample data", dataQuality.isSampleData ? "YES" : "NO");
  if (dataQuality.warnings.length) {
    kv(sheet, "Warnings", dataQuality.warnings.join("; "));
  }
  addBlankRow(sheet);

  addSectionHeader(sheet, "Date Semantics");
  kv(sheet, "Orders", "order_date");
  kv(sheet, "Sales", "sale_date");
  kv(sheet, "Finance", "operation_date");
  kv(sheet, "Ads", "campaign_date");
  kv(sheet, "Product Cost", "effective cost period");
  addBlankRow(sheet);

  if (!model.hasCommercialActivity) {
    writeEmptyNotice(sheet);
  }

  applyColumnWidths(sheet, [36, 72]);
}

function buildExecutiveSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.executive);
  const fe = model.ctx.financialEngine;
  const op = model.ctx.overview.ordersPurchases;
  const qty = model.ctx.overview.quantityMetrics;
  const cash = model.ctx.overview.cashReceived;
  const expected = model.ctx.overview.expectedWbPayout;

  writeSheetIntro(sheet, "Executive Summary", model.reportTitle);
  writeWarning(sheet, model.dataQuality.financeIncompleteWarning);

  if (!model.hasCommercialActivity) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [36, 20]);
    return;
  }

  addSectionHeader(sheet, "Selected period — Financial Engine KPIs");
  addKpiBlock(sheet, [
    { label: "Net Sales", value: fe.netSales, numFmt: NUM_FMT.currency },
    {
      label: "Marketplace Fee",
      value: fe.marketplaceFee ?? fe.commission,
      numFmt: NUM_FMT.currency,
    },
    { label: "Revenue", value: fe.revenue, numFmt: NUM_FMT.currency },
    { label: "Logistics", value: fe.logistics, numFmt: NUM_FMT.currency },
    { label: "Storage", value: fe.storage, numFmt: NUM_FMT.currency },
    { label: "Acceptance", value: fe.acceptance, numFmt: NUM_FMT.currency },
    { label: "Penalties", value: fe.penalties, numFmt: NUM_FMT.currency },
    { label: "Other", value: fe.adjustments, numFmt: NUM_FMT.currency },
    { label: "Product Cost", value: fe.productCost, numFmt: NUM_FMT.currency },
    { label: "Advertising", value: fe.advertising, numFmt: NUM_FMT.currency },
    { label: "Estimated Tax", value: fe.estimatedTax, numFmt: NUM_FMT.currency },
    { label: "Net Profit", value: fe.finalNetProfit, numFmt: NUM_FMT.currency },
    {
      label: "Seller Payout / Settlement",
      value: fe.sellerPayout,
      numFmt: NUM_FMT.currency,
    },
  ]);
  addBlankRow(sheet);

  addSectionHeader(sheet, "Selected period — Operational KPIs");
  addKpiBlock(sheet, [
    { label: "Orders", value: op.ordersCount, numFmt: NUM_FMT.integer },
    { label: "Sold Units", value: qty.unitsSold, numFmt: NUM_FMT.integer },
    { label: "Returned Units", value: qty.unitsReturned, numFmt: NUM_FMT.integer },
    { label: "Net Units", value: qty.netUnits, numFmt: NUM_FMT.integer },
  ]);
  addBlankRow(sheet);

  addSectionHeader(sheet, "Selected period — Cash flow (overview)");
  addKpiBlock(sheet, [
    {
      label: "Cash Received",
      value: cash?.amount ?? null,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Expected WB Payout",
      value: expected?.amount ?? null,
      numFmt: NUM_FMT.currency,
    },
  ]);

  if (model.periodBreakdownKind !== "none") {
    writeFePeriodBreakdown(
      sheet,
      model.periodBreakdown,
      model.periodBreakdownKind,
      "ExecPeriodBreakdown"
    );
  }
  addBlankRow(sheet);

  addSectionHeader(sheet, "Data Quality Status");
  kv(
    sheet,
    "Finance complete",
    model.dataQuality.financeComplete
      ? "YES — results may be treated as final for Finance coverage"
      : "NO — financial results are NOT FINAL"
  );
  kv(sheet, "Finance latest operation_date", model.dataQuality.financeLatestOperationDate);
  writeWarning(sheet, model.dataQuality.financeIncompleteWarning);

  applyColumnWidths(sheet, [40, 22]);
}

function buildPnLSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.pnl);
  writeSheetIntro(sheet, "Profit & Loss", model.reportTitle);
  writeWarning(sheet, model.dataQuality.financeIncompleteWarning);

  if (!model.hasCommercialActivity) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [28, 18]);
    return;
  }

  addSectionHeader(sheet, "Selected period totals");
  writeExcelTable(sheet, {
    name: "PnLLines",
    headers: ["Line", "Amount"],
    rows: model.pnl.lines.map((l) => [
      l.label,
      l.isPercent ? l.amount / 100 : l.amount,
    ]),
    columnFormats: [undefined, NUM_FMT.currency],
  });

  const marginIdx = model.pnl.lines.findIndex((l) => l.isPercent);
  if (marginIdx >= 0) {
    sheet.eachRow((row) => {
      if (row.getCell(1).value === "Net Margin %") {
        row.getCell(2).numFmt = NUM_FMT.percent;
        row.getCell(2).value = model.pnl.lines[marginIdx].amount / 100;
      }
    });
  }

  if (model.periodBreakdownKind !== "none") {
    writeFePeriodBreakdown(
      sheet,
      model.periodBreakdown,
      model.periodBreakdownKind,
      "PnLPeriodBreakdown"
    );
  }

  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [32, 18]);
}

function buildSettlementSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.settlement);
  writeSheetIntro(
    sheet,
    "Settlement",
    `${model.reportTitle} · Net Transfer = sellerPayout · Settlement ≠ Net Profit`
  );
  writeWarning(sheet, model.dataQuality.financeIncompleteWarning);

  if (!model.hasCommercialActivity) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [28, 18, 18]);
    return;
  }

  writeExcelTable(sheet, {
    name: "SettlementLines",
    headers: ["Section", "Line", "Amount"],
    rows: model.settlement.lines.map((l) => [l.section, l.label, l.amount]),
    columnFormats: [undefined, undefined, NUM_FMT.currency],
  });
  addBlankRow(sheet);
  addKpiBlock(sheet, [
    {
      label: "Net Transfer (sellerPayout)",
      value: model.settlement.netTransfer,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Account Net Profit (finalNetProfit)",
      value: model.ctx.financialEngine.finalNetProfit,
      numFmt: NUM_FMT.currency,
    },
  ]);
  const note = sheet.addRow([
    "Settlement (sellerPayout) is WB money transfer after marketplace costs. Net Profit additionally subtracts Product Cost, Advertising, and Estimated Tax.",
  ]);
  note.getCell(1).font = FONT.subtitle;

  if (model.periodBreakdownKind !== "none") {
    addBlankRow(sheet);
    addSectionHeader(
      sheet,
      periodBreakdownSectionTitle(model.periodBreakdownKind)
    );
    writeExcelTable(sheet, {
      name: "SettlementPeriodBreakdown",
      headers: [
        "Period",
        "From",
        "To",
        "Seller Payout",
        "Net Profit",
        "Revenue",
        "Cash Received",
        "Expected WB Payout",
      ],
      rows: model.periodBreakdown.map((r) => [
        r.chunk.label,
        r.chunk.from,
        r.chunk.to,
        r.sellerPayout,
        r.finalNetProfit,
        r.revenue,
        r.cashReceived,
        r.expectedWbPayout,
      ]),
      columnFormats: [
        undefined,
        undefined,
        undefined,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
      ],
    });
  }

  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [14, 36, 18]);
}

function buildSalesOrdersSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.salesOrders);
  const fe = model.ctx.financialEngine;
  const op = model.ctx.overview.ordersPurchases;
  const qty = model.ctx.overview.quantityMetrics;
  const cash = model.ctx.overview.cashReceived;
  const expected = model.ctx.overview.expectedWbPayout;

  writeSheetIntro(
    sheet,
    "Sales & Orders KPIs",
    `${model.reportTitle} · Orders → order_date · Sales → sale_date`
  );

  if (!model.hasCommercialActivity) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [36, 20]);
    return;
  }

  addSectionHeader(sheet, "Selected period totals");
  addKpiBlock(sheet, [
    { label: "Orders", value: op.ordersCount, numFmt: NUM_FMT.integer },
    { label: "Orders Value", value: op.ordersValue, numFmt: NUM_FMT.currency },
    { label: "Gross Sales", value: fe.grossSales, numFmt: NUM_FMT.currency },
    { label: "Returned Sales", value: fe.returnedSales, numFmt: NUM_FMT.currency },
    { label: "Net Sales", value: fe.netSales, numFmt: NUM_FMT.currency },
    { label: "Sold Units", value: qty.unitsSold, numFmt: NUM_FMT.integer },
    { label: "Returned Units", value: qty.unitsReturned, numFmt: NUM_FMT.integer },
    { label: "Net Units", value: qty.netUnits, numFmt: NUM_FMT.integer },
    {
      label: "Conversion %",
      value: op.conversionRate / 100,
      numFmt: NUM_FMT.percent,
    },
    {
      label: "Cash Received",
      value: cash?.amount ?? null,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Expected WB Payout",
      value: expected?.amount ?? null,
      numFmt: NUM_FMT.currency,
    },
  ]);
  addBlankRow(sheet);
  const note = sheet.addRow([
    "FE Net Sales = Σ(priceWithDisc) on Sales API — not WB weekly «Вайлдберриз реализовал (Пр)» / Продажа.",
  ]);
  note.getCell(1).font = FONT.subtitle;

  if (model.periodBreakdownKind !== "none") {
    addBlankRow(sheet);
    addSectionHeader(
      sheet,
      periodBreakdownSectionTitle(model.periodBreakdownKind)
    );
    writeExcelTable(sheet, {
      name: "SalesOrdersPeriodBreakdown",
      headers: [
        "Period",
        "From",
        "To",
        "Orders",
        "Sold Units",
        "Returned Units",
        "Net Units",
        "Net Sales",
        "Cash Received",
        "Expected WB Payout",
      ],
      rows: model.periodBreakdown.map((r) => [
        r.chunk.label,
        r.chunk.from,
        r.chunk.to,
        r.ordersCount,
        r.unitsSold,
        r.unitsReturned,
        r.netUnits,
        r.netSales,
        r.cashReceived,
        r.expectedWbPayout,
      ]),
      columnFormats: [
        undefined,
        undefined,
        undefined,
        NUM_FMT.integer,
        NUM_FMT.integer,
        NUM_FMT.integer,
        NUM_FMT.integer,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
      ],
    });
  }

  applyColumnWidths(sheet, [36, 20]);
}

function buildProductSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.productProfit);
  writeSheetIntro(
    sheet,
    "Product Profitability",
    `${model.reportTitle} · selected-period totals`
  );

  if (model.productProfit.rows.length === 0) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [16]);
    return;
  }

  writeExcelTable(sheet, {
    name: "ProductProfit",
    headers: [
      "SKU",
      "Product Name",
      "Brand",
      "Category",
      "Units",
      "Net Sales",
      "Revenue",
      "Marketplace Fee",
      "Logistics",
      "Storage",
      "Advertising",
      "Product Cost",
      "Net Profit",
      "Margin %",
      "ROI %",
    ],
    rows: model.productProfit.rows.map((r) => [
      r.sku,
      r.productName,
      r.brand,
      r.category,
      r.unitsSold,
      r.netSales,
      r.revenue,
      r.marketplaceFees,
      r.logistics,
      r.storage,
      r.advertising,
      r.productCost,
      r.netProfit,
      r.netMarginPercent / 100,
      r.roiPercent == null ? null : r.roiPercent / 100,
    ]),
    columnFormats: [
      undefined,
      undefined,
      undefined,
      undefined,
      NUM_FMT.integer,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.percent,
      NUM_FMT.percent,
    ],
  });
  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [14, 28, 14, 14, 10, 14, 14, 14, 12, 12, 12, 12, 14, 10, 10]);
}

function buildGroupSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  model: WeeklyBusinessWorkbookModel,
  dimension: "brand" | "category"
): void {
  const view =
    dimension === "brand" ? model.brandPerformance : model.categoryPerformance;
  const sheet = workbook.addWorksheet(sheetName);
  writeSheetIntro(
    sheet,
    title,
    `${model.reportTitle} · ${
      dimension === "category" ? "selected-period totals" : `Source: ${view.source}`
    }`
  );

  if (dimension === "brand") {
    const note = sheet.addRow([model.reconciliation.brandAttributionNote]);
    note.getCell(1).font = FONT.subtitle;
    sheet.mergeCells(note.number, 1, note.number, 6);
    addBlankRow(sheet);
  }

  if (view.rows.length === 0) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [16]);
    return;
  }

  writeExcelTable(sheet, {
    name: dimension === "brand" ? "BrandPerf" : "CategoryPerf",
    headers: [
      dimension === "brand" ? "Brand" : "Category",
      "Products",
      "Units",
      "Net Sales",
      "Revenue",
      "Marketplace Fee",
      "Logistics",
      "Storage",
      "Product Cost",
      "Advertising",
      "Net Profit",
      "Margin %",
      "ROI %",
    ],
    rows: view.rows.map((r) => [
      r.name,
      r.productCount,
      r.unitsSold,
      r.netSales,
      r.revenue,
      r.marketplaceFees,
      r.logistics,
      r.storage,
      r.productCost,
      r.advertising,
      r.netProfit,
      r.netMarginPercent / 100,
      r.roiPercent == null ? null : r.roiPercent / 100,
    ]),
    columnFormats: [
      undefined,
      NUM_FMT.integer,
      NUM_FMT.integer,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.percent,
      NUM_FMT.percent,
    ],
  });

  if (
    dimension === "brand" &&
    model.periodBreakdownKind !== "none" &&
    model.brandPeriodBreakdown.length > 0
  ) {
    addBlankRow(sheet);
    addSectionHeader(
      sheet,
      periodBreakdownSectionTitle(model.periodBreakdownKind)
    );
    writeExcelTable(sheet, {
      name: "BrandPeriodBreakdown",
      headers: [
        "Period",
        "From",
        "To",
        "Brand",
        "Units",
        "Net Sales",
        "Net Profit",
      ],
      rows: model.brandPeriodBreakdown.map((r) => [
        r.periodLabel,
        r.from,
        r.to,
        r.brand,
        r.unitsSold,
        r.netSales,
        r.finalNetProfit,
      ]),
      columnFormats: [
        undefined,
        undefined,
        undefined,
        undefined,
        NUM_FMT.integer,
        NUM_FMT.currency,
        NUM_FMT.currency,
      ],
    });
  }

  if (dimension === "brand" && model.brandOperBreakdown.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(
      sheet,
      "Brand × supplier_oper_name (DB finance lines — not a WB 82-col clone)"
    );
    writeExcelTable(sheet, {
      name: "BrandOperBreakdown",
      headers: ["Brand", "supplier_oper_name", "Amount", "Line Count"],
      rows: model.brandOperBreakdown.map((r) => [
        r.brand,
        r.supplierOperName,
        r.amount,
        r.lineCount,
      ]),
      columnFormats: [undefined, undefined, NUM_FMT.currency, NUM_FMT.integer],
    });
  }

  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [18, 10, 10, 14, 14, 14, 12, 12, 12, 12, 14, 10, 10]);
}

function buildBrandSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  buildGroupSheet(
    workbook,
    WEEKLY_WORKBOOK_SHEET_NAMES.brand,
    "Brand Performance",
    model,
    "brand"
  );
}

function buildCategorySheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  buildGroupSheet(
    workbook,
    WEEKLY_WORKBOOK_SHEET_NAMES.category,
    "Category Performance",
    model,
    "category"
  );
}

function buildGlossarySheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.glossary);
  writeSheetIntro(
    sheet,
    "FE ↔ WB Glossary",
    "Do not equate Excel Продажа with FE Net Sales · Settlement ≠ Net Profit"
  );

  writeExcelTable(sheet, {
    name: "Glossary",
    headers: [
      "WB Weekly Excel Term",
      "Financial Engine Term",
      "Formula / Meaning",
      "Date Axis",
      "Match Status",
      "Notes",
    ],
    rows: model.glossary.map((g) => [
      g.wbWeeklyTerm,
      g.financialEngineTerm,
      g.formulaMeaning,
      g.dateAxis,
      g.matchStatus,
      g.notes,
    ]),
  });
  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [40, 32, 48, 28, 18, 40]);
}

function buildReconciliationSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.reconciliation);
  const r = model.reconciliation;
  writeSheetIntro(
    sheet,
    "Reconciliation",
    `${model.reportTitle} · Account-level vs product/brand attributed Net Profit`
  );

  const identity = sheet.addRow([r.identityStatement]);
  identity.getCell(1).font = FONT.subtitle;
  sheet.mergeCells(identity.number, 1, identity.number, 6);
  addBlankRow(sheet);

  addKpiBlock(sheet, [
    {
      label: "Account-level Net Profit",
      value: r.accountFinalNetProfit,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Σ Product allocated Net Profit",
      value: r.sumProductFinalNetProfit,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Σ Brand allocated Net Profit",
      value: r.sumBrandFinalNetProfit,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Unallocated / Account-level (explained)",
      value: r.explainedUnallocatedNetProfit,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Residual reconciliation adjustment",
      value: r.residualDifference,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Reconciliation Difference (Account − Σ Product)",
      value: r.difference,
      numFmt: NUM_FMT.currency,
    },
  ]);
  addBlankRow(sheet);

  addSectionHeader(
    sheet,
    "Unallocated Account-Level components (account − allocated)"
  );
  writeExcelTable(sheet, {
    name: "ReconciliationComponents",
    headers: [
      "Component",
      "Account amount",
      "Allocated (Σ product)",
      "Unallocated",
      "Net Profit effect",
      "Source",
    ],
    rows: r.components.map((c) => [
      c.label,
      c.accountAmount,
      c.allocatedAmount,
      c.unallocatedAmount,
      c.netProfitEffect,
      c.source,
    ]),
    columnFormats: [
      undefined,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      NUM_FMT.currency,
      undefined,
    ],
  });
  addBlankRow(sheet);
  addSectionHeader(sheet, "Notes");
  const brandNote = sheet.addRow([r.brandAttributionNote]);
  brandNote.getCell(1).font = FONT.body;
  sheet.mergeCells(brandNote.number, 1, brandNote.number, 6);
  const note = sheet.addRow([r.explanation]);
  note.getCell(1).font = FONT.body;
  sheet.mergeCells(note.number, 1, note.number, 6);
  applyColumnWidths(sheet, [48, 16, 18, 14, 16, 56]);
}

function buildFinanceDetailSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.financeDetail);
  writeSheetIntro(
    sheet,
    "Finance Detail",
    `${model.reportTitle} · Normalized wb_finance — operation_date`
  );
  writeWarning(sheet, model.dataQuality.financeIncompleteWarning);
  writeWarning(sheet, model.dataQuality.financeNoDataMessage);

  kv(
    sheet,
    "Finance latest operation_date",
    model.dataQuality.financeLatestOperationDate
  );
  kv(sheet, "Selected period end", model.dataQuality.scopeTo);
  kv(sheet, "Finance gap days", model.dataQuality.financeGapDays);
  kv(sheet, "Finance rows in period", model.dataQuality.financeRowsInPeriod);
  kv(
    sheet,
    "Finance complete",
    model.dataQuality.financeComplete ? "YES" : "NO"
  );
  addBlankRow(sheet);

  if (model.financeDetail.length === 0) {
    const msg =
      model.dataQuality.financeNoDataMessage ??
      "No Finance data available for selected period.";
    const row = sheet.addRow([msg]);
    row.getCell(1).font = FONT.subtitle;
    applyColumnWidths(sheet, [72, 24]);
    return;
  }

  writeExcelTable(sheet, {
    name: "FinanceDetail",
    headers: [
      "operation_date",
      "nm_id",
      "brand",
      "srid",
      "supplier_oper_name",
      "operation_type",
      "finance_category",
      "amount",
      "source_key",
      "realizationreport_id",
    ],
    rows: model.financeDetail.map((r) => [
      r.operationDate,
      r.nmId,
      r.brand,
      r.srid,
      r.supplierOperName,
      r.operationType,
      r.financeCategory,
      r.amount,
      r.sourceKey,
      r.realizationReportId,
    ]),
    columnFormats: [
      undefined,
      NUM_FMT.integer,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      NUM_FMT.currency,
      undefined,
      NUM_FMT.integer,
    ],
  });
  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [14, 12, 14, 28, 28, 14, 16, 14, 28, 16]);
}

function buildSalesDetailSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.salesDetail);
  writeSheetIntro(
    sheet,
    "Sales Detail",
    `${model.reportTitle} · wb_sales — sale_date axis`
  );

  if (model.salesDetail.length === 0) {
    writeEmptyNotice(sheet);
    applyColumnWidths(sheet, [16]);
    return;
  }

  writeExcelTable(sheet, {
    name: "SalesDetail",
    headers: [
      "sale_date",
      "srid",
      "nm_id",
      "product",
      "brand",
      "quantity",
      "price_with_disc",
      "for_pay",
      "is_return",
      "warehouse",
    ],
    rows: model.salesDetail.map((r) => [
      r.saleDate,
      r.srid,
      r.nmId,
      r.productName,
      r.brand,
      r.quantity,
      r.priceWithDisc,
      r.forPay,
      r.isReturn ? "YES" : "NO",
      r.warehouse,
    ]),
    columnFormats: [
      undefined,
      undefined,
      NUM_FMT.integer,
      undefined,
      undefined,
      NUM_FMT.integer,
      NUM_FMT.currency,
      NUM_FMT.currency,
      undefined,
      undefined,
    ],
  });
  freezeAtRow(sheet, 5);
  applyColumnWidths(sheet, [12, 28, 12, 24, 14, 10, 14, 14, 10, 16]);
}

function buildCashFlowSheet(
  workbook: ExcelJS.Workbook,
  model: WeeklyBusinessWorkbookModel
): void {
  const sheet = workbook.addWorksheet(WEEKLY_WORKBOOK_SHEET_NAMES.cashFlow);
  const cf = model.cashFlow;
  writeSheetIntro(
    sheet,
    "Cash Flow",
    `${model.reportTitle} · Existing overview + Financial Engine settlement outputs only`
  );
  writeWarning(sheet, model.dataQuality.financeIncompleteWarning);

  addSectionHeader(sheet, "Inflows / settlement (selected period)");
  addKpiBlock(sheet, [
    {
      label: "Actual Cash Received (bankPaymentSum)",
      value: cf.actualCashReceived,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Expected WB Payout",
      value: cf.expectedWbPayout,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "WB Seller Payout / Settlement",
      value: cf.sellerPayoutSettlement,
      numFmt: NUM_FMT.currency,
    },
  ]);
  addBlankRow(sheet);
  kv(sheet, "Actual Cash Received source", cf.actualCashReceivedSource);
  if (cf.actualCashReceivedUnavailableReason) {
    kv(sheet, "Actual Cash Received note", cf.actualCashReceivedUnavailableReason);
  }
  kv(sheet, "Expected WB Payout source", cf.expectedWbPayoutSource);
  if (cf.expectedWbPayoutUnavailableReason) {
    kv(sheet, "Expected WB Payout note", cf.expectedWbPayoutUnavailableReason);
  }
  kv(sheet, "Seller Payout source", cf.sellerPayoutSource);
  kv(sheet, "Seller Payout meaning", cf.sellerPayoutMeaning);
  addBlankRow(sheet);

  addSectionHeader(sheet, "Cash-relevant outflows (Financial Engine — selected period)");
  addKpiBlock(sheet, [
    { label: "Product Cost", value: cf.productCost, numFmt: NUM_FMT.currency },
    { label: "Logistics", value: cf.logistics, numFmt: NUM_FMT.currency },
    { label: "Storage", value: cf.storage, numFmt: NUM_FMT.currency },
    { label: "Acceptance", value: cf.acceptance, numFmt: NUM_FMT.currency },
    { label: "Penalties", value: cf.penalties, numFmt: NUM_FMT.currency },
    { label: "Other costs", value: cf.otherCosts, numFmt: NUM_FMT.currency },
    { label: "Advertising", value: cf.advertising, numFmt: NUM_FMT.currency },
    { label: "Estimated Tax", value: cf.estimatedTax, numFmt: NUM_FMT.currency },
  ]);
  addBlankRow(sheet);

  addSectionHeader(sheet, "Net cash movement");
  addKpiBlock(sheet, [
    {
      label: "Net Cash Movement",
      value: cf.netCashMovement,
      numFmt: NUM_FMT.currency,
    },
    {
      label: "Settlement-basis Net Profit (FE finalNetProfit)",
      value: cf.settlementBasisNetProfit,
      numFmt: NUM_FMT.currency,
    },
  ]);
  kv(sheet, "Net Cash Movement basis", cf.netCashMovementBasis);

  if (model.periodBreakdownKind !== "none" && model.periodBreakdown.length > 0) {
    addBlankRow(sheet);
    addSectionHeader(
      sheet,
      periodBreakdownSectionTitle(model.periodBreakdownKind)
    );
    writeExcelTable(sheet, {
      name: "CashFlowPeriodBreakdown",
      headers: [
        "Period",
        "From",
        "To",
        "Actual Cash Received",
        "Expected WB Payout",
        "WB Seller Payout / Settlement",
        "Product Cost",
        "Logistics",
        "Storage",
        "Advertising",
        "Estimated Tax",
        "Settlement-basis Net Profit",
      ],
      rows: model.periodBreakdown.map((r) => [
        r.chunk.label,
        r.chunk.from,
        r.chunk.to,
        r.cashReceived,
        r.expectedWbPayout,
        r.sellerPayout,
        r.productCost,
        r.logistics,
        r.storage,
        r.advertising,
        r.estimatedTax,
        r.finalNetProfit,
      ]),
      columnFormats: [
        undefined,
        undefined,
        undefined,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
        NUM_FMT.currency,
      ],
    });
  }

  applyColumnWidths(sheet, [48, 56]);
}
