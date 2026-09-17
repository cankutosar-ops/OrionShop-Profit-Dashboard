/**
 * Shared CSV exporter — UTF-8 with BOM, semicolon delimiter (locale-safe for RU Excel).
 */

import type { ReportExportDocument } from "@/lib/reporting/module/export/export-document";
import { formatExportCell } from "@/lib/reporting/module/export/format-values";
import { escapeSpreadsheetCsvCell } from "@/lib/csv-cell";

const DELIMITER = ";";

function line(cells: string[], numeric: boolean[] = []): string {
  return cells.map((cell, index) => escapeSpreadsheetCsvCell(cell, numeric[index])).join(DELIMITER);
}

export function exportReportCsv(doc: ReportExportDocument): Uint8Array {
  const lines: string[] = [];

  lines.push(line(["Report Name", doc.title]));
  lines.push(line(["Generated At", doc.generatedAt]));
  lines.push(line(["Company", doc.meta.company]));
  lines.push(line(["Marketplace", doc.meta.marketplace]));
  lines.push(line(["Date Range", `${doc.meta.dateFrom} → ${doc.meta.dateTo}`]));
  for (const f of doc.meta.filters) {
    lines.push(line([f.label, f.value]));
  }
  lines.push("");

  if (doc.summary.length > 0) {
    lines.push(line(["Summary"]));
    lines.push(line(["Metric", "Value"]));
    for (const s of doc.summary) {
      lines.push(
        line([s.label, formatExportCell(s.value, s.type, doc.currency)], [false, s.type !== "text"])
      );
    }
    lines.push("");
  }

  lines.push(line(doc.columns.map((c) => c.header)));
  for (const row of doc.rows) {
    lines.push(
      line(
        doc.columns.map((col) => formatExportCell(row[col.key], col.type, doc.currency)),
        doc.columns.map((col) => col.type !== "text")
      )
    );
  }

  const text = `\uFEFF${lines.join("\r\n")}`;
  return new TextEncoder().encode(text);
}
