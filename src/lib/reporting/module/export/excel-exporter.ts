/**
 * Shared Excel (.xlsx) exporter for Reporting Module documents.
 */

import ExcelJS from "exceljs";
import type { ReportExportDocument } from "@/lib/reporting/module/export/export-document";
import { excelNumFmt } from "@/lib/reporting/module/export/format-values";
import {
  FILL,
  FONT,
  addBlankRow,
  addKpiBlock,
  addSectionHeader,
  applyColumnWidths,
  styleManualHeaderRow,
  writeSheetIntro,
} from "@/lib/reporting/excel/workbook-kit";

function filtersSummary(doc: ReportExportDocument): string {
  const parts = [
    `Company: ${doc.meta.company}`,
    `Marketplace: ${doc.meta.marketplace}`,
    `Period: ${doc.meta.dateFrom} → ${doc.meta.dateTo}`,
    ...doc.meta.filters.map((f) => `${f.label}: ${f.value}`),
  ];
  return parts.join(" · ");
}

function autoWidth(sheet: ExcelJS.Worksheet, colCount: number): void {
  const widths: number[] = [];
  for (let c = 1; c <= colCount; c++) {
    let max = 10;
    sheet.getColumn(c).eachCell({ includeEmpty: false }, (cell) => {
      const text = cell.value == null ? "" : String(cell.value);
      max = Math.min(48, Math.max(max, text.length + 2));
    });
    widths.push(max);
  }
  applyColumnWidths(sheet, widths);
}

export async function exportReportExcel(
  doc: ReportExportDocument
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "OrionShop Profit Dashboard";
  workbook.created = new Date(doc.generatedAt);

  const sheetName = doc.title.slice(0, 31) || "Report";
  const sheet = workbook.addWorksheet(sheetName);

  writeSheetIntro(sheet, doc.title, filtersSummary(doc));
  sheet.addRow([`Generated at: ${doc.generatedAt}`]).getCell(1).font = FONT.subtitle;
  addBlankRow(sheet);

  if (doc.summary.length > 0) {
    addSectionHeader(sheet, "Summary");
    addKpiBlock(
      sheet,
      doc.summary.map((s) => ({
        label: s.label,
        value: s.value,
        numFmt: excelNumFmt(s.type, doc.currency),
      }))
    );
    addBlankRow(sheet);
  }

  addSectionHeader(sheet, "Report data");
  const header = sheet.addRow(doc.columns.map((c) => c.header));
  styleManualHeaderRow(header);

  for (const row of doc.rows) {
    const excelRow = sheet.addRow(
      doc.columns.map((col) => {
        const v = row[col.key];
        if (v == null || v === "") return null;
        if (col.type === "text") return String(v);
        if (typeof v === "number" && Number.isFinite(v)) return v;
        return v == null ? null : String(v);
      })
    );
    doc.columns.forEach((col, idx) => {
      const cell = excelRow.getCell(idx + 1);
      const fmt = excelNumFmt(col.type, doc.currency);
      if (fmt && typeof cell.value === "number") {
        cell.numFmt = fmt;
      }
      cell.font = FONT.body;
      if (col.type !== "text") {
        cell.alignment = { horizontal: "right" };
      }
    });
  }

  // Ensure header fill visible even with few rows
  header.eachCell((cell) => {
    cell.fill = FILL.header;
    cell.font = FONT.header;
  });

  autoWidth(sheet, Math.max(2, doc.columns.length));

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
