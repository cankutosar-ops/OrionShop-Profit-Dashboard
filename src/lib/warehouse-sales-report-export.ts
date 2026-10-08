import ExcelJS from "exceljs";
import { escapeSpreadsheetCsvCell } from "@/lib/csv-cell";
import type { WarehouseProductReportRow } from "@/lib/warehouse-sales-analytics";
import type { ScopedDateRange } from "@/types/database";

export function selectWarehouseReportRows(rows: WarehouseProductReportRow[], warehouse?: string | null, search?: string | null) {
  const term = search?.trim().toLowerCase();
  return rows.filter(row => (!warehouse || row.warehouse === warehouse.trim()) &&
    (!term || `${row.sku} ${row.productName}`.toLowerCase().includes(term)));
}

const headers = ["Warehouse", "SKU", "Product name", "WB article", "Units sold", "Sales (RUB)"];

export function renderWarehouseSalesCsv(rows: WarehouseProductReportRow[]): string {
  const lines = [headers.join(","), ...rows.map(row => [
    escapeSpreadsheetCsvCell(row.warehouse), escapeSpreadsheetCsvCell(row.sku),
    escapeSpreadsheetCsvCell(row.productName), escapeSpreadsheetCsvCell(String(row.nmId ?? "")),
    escapeSpreadsheetCsvCell(String(row.units), true), escapeSpreadsheetCsvCell(String(row.revenue), true),
  ].join(","))];
  return "\uFEFF" + lines.join("\r\n");
}

export async function renderWarehouseSalesWorkbook(rows: WarehouseProductReportRow[], scope: ScopedDateRange, warehouse?: string | null, search?: string | null) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OrionShop";
  const details = workbook.addWorksheet("Warehouse Products");
  details.columns = headers.map((header, i) => ({ header, width: [32, 24, 48, 18, 14, 20][i] }));
  details.views = [{ state: "frozen", ySplit: 1 }];
  for (const row of rows) details.addRow([row.warehouse, row.sku, row.productName, row.nmId ?? "", row.units, row.revenue]);
  details.autoFilter = { from: "A1", to: "F1" };
  details.getColumn(6).numFmt = '#,##0.00';
  const totals = new Map<string, { units: number; revenue: number }>();
  for (const row of rows) {
    const total = totals.get(row.warehouse) ?? { units: 0, revenue: 0 };
    total.units += row.units; total.revenue += row.revenue;
    totals.set(row.warehouse, total);
  }
  const summary = workbook.addWorksheet("Warehouse Summary");
  summary.columns = [{ header: "Warehouse", width: 40 }, { header: "Units sold", width: 16 }, { header: "Sales (RUB)", width: 20 }];
  for (const [name, total] of totals) summary.addRow([name, total.units, total.revenue]);
  summary.addRow(["Total", rows.reduce((n, r) => n + r.units, 0), rows.reduce((n, r) => n + r.revenue, 0)]).font = { bold: true };
  summary.getColumn(3).numFmt = '#,##0.00';
  const notes = workbook.addWorksheet("Report Scope");
  notes.columns = [{ header: "Field", width: 24 }, { header: "Value", width: 100 }];
  for (const pair of [
    ["Company", scope.companyId], ["Account", scope.marketplaceAccountId],
    ["From", scope.from], ["To (inclusive)", scope.to], ["Brand", scope.brandId ?? "All brands"],
    ["Warehouse", warehouse ?? "All warehouses"], ["Product search", search ?? ""],
    ["Units sold", "Completed wb_sales quantities; returns excluded. This is not stock or orders."],
    ["Sales (RUB)", "Stored price_with_disc × quantity; commercial sales, not Finance settlement Revenue."],
    ["Warehouse identity", "FBS attribution uses persisted account-scoped assembly RID/SRID and nm_id evidence. Unmatched records keep their stored WB label; attribution may be incomplete."],
    ["Empty report", "No matching stored completed sales; absence does not prove source synchronization completeness."],
  ]) notes.addRow(pair);
  for (const sheet of workbook.worksheets) sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
