/**
 * Shared Excel workbook presentation kit for ReportDocument renderers.
 * Formatting only — never calculate business metrics.
 */
import type ExcelJS from "exceljs";

export const NOT_AVAILABLE = "Not available";

export const FONT = {
  title: { name: "Calibri", size: 18, bold: true, color: { argb: "FF111827" } },
  subtitle: { name: "Calibri", size: 11, color: { argb: "FF6B7280" } },
  section: { name: "Calibri", size: 12, bold: true, color: { argb: "FF111827" } },
  label: { name: "Calibri", size: 10, bold: true, color: { argb: "FF6B7280" } },
  body: { name: "Calibri", size: 11, color: { argb: "FF111827" } },
  header: { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } },
} as const;

export const FILL = {
  header: {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FF1F2937" },
  },
  kpi: {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF3F4F6" },
  },
  callout: {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFEFF6FF" },
  },
};

/** Native Excel number formats (values stay numeric). */
export const NUM_FMT = {
  currency: '#,##0.00 "₽"',
  integer: "#,##0",
  percent: "0.0%",
  number: "#,##0.00",
} as const;

export type SheetCellValue = string | number | boolean | Date | null | undefined;

export function findSectionData<T>(
  sections: Array<{ id: string; data: unknown }>,
  id: string
): T | undefined {
  return sections.find((s) => s.id === id)?.data as T | undefined;
}

export function applyColumnWidths(
  sheet: ExcelJS.Worksheet,
  widths: number[]
): void {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

export function freezeAtRow(sheet: ExcelJS.Worksheet, rows: number): void {
  sheet.views = [
    {
      state: "frozen",
      ySplit: rows,
      activeCell: "A1",
      showGridLines: true,
    },
  ];
}

/** Write title (+ optional subtitle) and a blank spacer. Returns next content row. */
export function writeSheetIntro(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle?: string
): number {
  const titleRow = sheet.addRow([title]);
  titleRow.getCell(1).font = FONT.title;
  titleRow.height = 28;

  if (subtitle) {
    const sub = sheet.addRow([subtitle]);
    sub.getCell(1).font = FONT.subtitle;
  }
  sheet.addRow([]);
  return sheet.rowCount + 1;
}

export function addSectionHeader(
  sheet: ExcelJS.Worksheet,
  title: string
): ExcelJS.Row {
  const row = sheet.addRow([title]);
  row.getCell(1).font = FONT.section;
  row.height = 20;
  return row;
}

export function addBlankRow(sheet: ExcelJS.Worksheet): void {
  sheet.addRow([]);
}

/** KPI block: Metric | Value pairs. */
export function addKpiBlock(
  sheet: ExcelJS.Worksheet,
  items: Array<{ label: string; value: SheetCellValue; numFmt?: string }>
): void {
  const header = sheet.addRow(["Metric", "Value"]);
  styleManualHeaderRow(header);
  for (const item of items) {
    const row = sheet.addRow([item.label, coalesceCell(item.value)]);
    row.getCell(1).font = FONT.body;
    row.getCell(1).fill = FILL.kpi;
    const valueCell = row.getCell(2);
    valueCell.font = { ...FONT.body, bold: true };
    valueCell.fill = FILL.kpi;
    if (typeof item.value === "number" && item.numFmt) {
      valueCell.numFmt = item.numFmt;
    }
  }
}

export function styleManualHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = FONT.header;
    cell.fill = FILL.header;
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  row.height = 20;
}

/**
 * Write a native Excel Table below the current sheet content.
 * Applies AutoFilter via the table definition.
 */
export function writeExcelTable(
  sheet: ExcelJS.Worksheet,
  options: {
    name: string;
    headers: string[];
    rows: SheetCellValue[][];
    /** Per-column number formats applied after table write */
    columnFormats?: Array<string | undefined>;
  }
): { headerRow: number; lastRow: number } {
  const headerRow = sheet.rowCount + 1;
  const dataRows =
    options.rows.length > 0
      ? options.rows.map((r) => r.map(coalesceCell))
      : [options.headers.map(() => "—")];
  const lastRow = headerRow + dataRows.length;
  const endCol = colLetter(options.headers.length);
  const ref = `A${headerRow}:${endCol}${lastRow}`;

  sheet.addTable({
    name: options.name,
    ref,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showRowStripes: true,
    },
    columns: options.headers.map((name) => ({ name, filterButton: true })),
    rows: dataRows,
  });

  // Apply number formats to data cells
  if (options.columnFormats) {
    for (let r = headerRow + 1; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      options.columnFormats.forEach((fmt, idx) => {
        if (!fmt) return;
        const cell = row.getCell(idx + 1);
        if (typeof cell.value === "number") {
          cell.numFmt = fmt;
        }
      });
    }
  }

  // Style header row for print clarity (table theme already styles it)
  const header = sheet.getRow(headerRow);
  header.height = 20;

  return { headerRow, lastRow };
}

function coalesceCell(value: SheetCellValue): string | number | boolean | Date {
  if (value === undefined || value === null || value === "") return "—";
  return value;
}

function colLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const rem = (num - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

/**
 * ReportDocument percentages are stored as percentage points (e.g. 12.2 = 12.2%).
 * Excel percent format expects a ratio (0.122).
 */
export function asExcelPercent(
  value: number | null | undefined
): number | typeof NOT_AVAILABLE {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value / 100;
}

export function asNumber(
  value: number | null | undefined
): number | typeof NOT_AVAILABLE {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE;
  return value;
}

export function textOrDash(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return "—";
  return value;
}
