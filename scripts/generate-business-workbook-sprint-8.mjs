/**
 * Sprint 8.0 — generate Business Intelligence Workbook from ReportDocument
 * and emit HTML sheet previews for screenshot proof.
 *
 * Usage:
 *   npx tsx scripts/generate-business-workbook-sprint-8.mjs
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";
import { buildBusinessReport } from "../src/lib/reporting/business-report.ts";
import {
  buildBusinessWorkbookFilename,
  renderBusinessReportWorkbook,
} from "../src/lib/reporting/excel/render-business-workbook.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

const OUT_DIR = path.join(
  process.cwd(),
  "exports",
  "browser-proof",
  "sprint-8-0-excel-renderer"
);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cellDisplay(cell) {
  if (cell == null) return "";
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "result" in v) {
    return String(v.result ?? "");
  }
  if (typeof v === "object" && v !== null && "text" in v) {
    return String(v.text ?? "");
  }
  if (typeof v === "object" && v !== null && "richText" in v) {
    return v.richText.map((t) => t.text).join("");
  }
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

async function workbookToHtmlPreviews(buffer, outDir) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const indexRows = [];

  for (const sheet of wb.worksheets) {
    const maxRow = Math.min(sheet.rowCount || 1, 80);
    const maxCol = Math.min(sheet.columnCount || 1, 20);
    const rows = [];
    for (let r = 1; r <= maxRow; r++) {
      const row = sheet.getRow(r);
      const cells = [];
      for (let c = 1; c <= maxCol; c++) {
        cells.push(`<td>${escapeHtml(cellDisplay(row.getCell(c)))}</td>`);
      }
      rows.push(`<tr>${cells.join("")}</tr>`);
    }

    const safeName = sheet.name.replace(/[^\w\-]+/g, "_");
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sheet.name)}</title>
  <style>
    body { font-family: Calibri, Segoe UI, sans-serif; margin: 24px; background: #f8fafc; color: #111827; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    p { color: #6b7280; margin: 0 0 16px; font-size: 13px; }
    table { border-collapse: collapse; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
    td { border: 1px solid #e5e7eb; padding: 6px 10px; font-size: 12px; white-space: nowrap; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
    tr:first-child td { font-weight: 700; background: #1f2937; color: #fff; }
  </style>
</head>
<body>
  <h1>${escapeHtml(sheet.name)}</h1>
  <p>Sprint 8.0 ReportDocument Excel Renderer — sheet preview (first ${maxRow} rows)</p>
  <table>${rows.join("\n")}</table>
</body>
</html>`;

    const file = path.join(outDir, `sheet-${safeName}.html`);
    await writeFile(file, html, "utf8");
    indexRows.push({
      name: sheet.name,
      file: path.basename(file),
      rows: sheet.rowCount,
    });
  }

  const indexHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Sprint 8.0 Workbook Sheets</title>
<style>body{font-family:Segoe UI,sans-serif;margin:32px} a{display:block;margin:8px 0}</style>
</head><body>
<h1>Business Intelligence Workbook — Sheets</h1>
${indexRows
  .map(
    (r) =>
      `<a href="${r.file}">${escapeHtml(r.name)} (${r.rows} rows)</a>`
  )
  .join("\n")}
</body></html>`;
  await writeFile(path.join(outDir, "index.html"), indexHtml, "utf8");
  return indexRows;
}

async function main() {
  loadEnv();
  await mkdir(OUT_DIR, { recursive: true });

  const scope = await resolveScopedDateRange({
    company: "1",
    account: "1",
    from: "2026-06-20",
    to: "2026-07-20",
  });

  const document = await buildBusinessReport(scope, {
    periodPresetLabel: "Monthly",
  });

  const buffer = await renderBusinessReportWorkbook(document);
  const filename = buildBusinessWorkbookFilename(document);
  const xlsxPath = path.join(OUT_DIR, filename);
  await writeFile(xlsxPath, Buffer.from(buffer));

  // Stable copy for proofs
  await writeFile(
    path.join(OUT_DIR, "business-intelligence-workbook.xlsx"),
    Buffer.from(buffer)
  );

  const sheets = await workbookToHtmlPreviews(buffer, OUT_DIR);

  const comparison = {
    sprint: "8.0",
    generatedAt: new Date().toISOString(),
    workbook: filename,
    engine: "report-document",
    sheetOrder: sheets.map((s) => s.name),
    legacyVsNew: {
      legacySheets: [
        "Cover",
        "Executive Summary",
        "Financial Summary",
        "Product Summary",
        "Inventory Summary",
      ],
      newSheets: sheets.map((s) => s.name),
      removed: ["Product Summary (Top-N boards only)"],
      added: [
        "04 Brand Analysis",
        "05 Product Analysis (full portfolio)",
        "06 Marketplace Costs",
        "07 Settlement",
        "09 Appendix",
      ],
      sourceOfTruth: "ReportDocument (same as BI Workspace)",
      calculations: "none — renderer only",
    },
    documentVersion: document.metadata.version,
    kpis: document.summary.metrics.slice(0, 4),
  };

  await writeFile(
    path.join(OUT_DIR, "comparison.json"),
    JSON.stringify(comparison, null, 2),
    "utf8"
  );

  console.log(
    JSON.stringify(
      { ok: true, xlsxPath, sheets: sheets.map((s) => s.name) },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
