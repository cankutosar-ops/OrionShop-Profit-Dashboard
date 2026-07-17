#!/usr/bin/env node
/**
 * Excel sale rows ↔ Sales API matching (Orders API for orderId link only).
 * No application code changes. No profit or accounting inference.
 *
 * Usage:
 *   node scripts/build-excel-sales-matching-report.mjs [excelPath] [exportDir] [outputPath]
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";
import * as XLSX from "xlsx";

const DEFAULT_EXCEL = "exports/general-financial-report.xlsx";
const DEFAULT_EXPORT_DIR = "exports/wb-raw-2026-06-30_2026-07-05";
const DEFAULT_OUTPUT = "exports/excel-sales-matching-report.md";

const SALE_OPER = "Продажа";
const TOLERANCE = 0.01;

function parseNum(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function saleDatePart(isoOrDate) {
  if (!isoOrDate) return null;
  if (isoOrDate instanceof Date) return isoOrDate.toISOString().slice(0, 10);
  return String(isoOrDate).slice(0, 10);
}

function isNumericExcelValue(v) {
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string" && v.trim() !== "") return parseNum(v) !== null;
  return false;
}

function formatExcelValue(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return v;
}

function excelNumericFields(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const formatted = formatExcelValue(v);
    if (isNumericExcelValue(formatted)) out[k] = parseNum(formatted) ?? formatted;
    else if (typeof formatted === "string" && /^\d{4}-\d{2}-\d{2}$/.test(formatted)) out[k] = formatted;
  }
  return out;
}

function salesMonetaryFields(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function loadJson(path) {
  return readFile(path, "utf8").then((raw) => JSON.parse(raw));
}

function evaluateMatch(excelRow, salesRow, orderRow) {
  const checks = {
    barcode: String(salesRow.barcode) === String(excelRow["Баркод"]),
    supplierArticle: String(salesRow.supplierArticle) === String(excelRow["Артикул поставщика"]),
    nmId: Number(salesRow.nmId) === Number(excelRow["Код номенклатуры"]),
    srid: String(salesRow.srid) === String(excelRow.Srid),
    orderId: Boolean(orderRow?.gNumber),
    saleDate: saleDatePart(salesRow.date) === saleDatePart(excelRow["Дата продажи"]),
    quantity: Number(excelRow["Кол-во"]) === 1,
  };
  const matched = Object.entries(checks).filter(([, ok]) => ok).map(([k]) => k);
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  return { checks, matched, failed, allExact: failed.length === 0 };
}

function findCandidates(excelRow, salesRows) {
  const srid = String(excelRow.Srid ?? "");
  const barcode = String(excelRow["Баркод"] ?? "");
  const saleDate = saleDatePart(excelRow["Дата продажи"]);

  const bySrid = salesRows.filter((s) => String(s.srid) === srid);
  if (bySrid.length > 0) return { source: "srid", rows: bySrid };

  const byBarcodeDate = salesRows.filter(
    (s) => String(s.barcode) === barcode && saleDatePart(s.date) === saleDate,
  );
  if (byBarcodeDate.length > 0) return { source: "barcode+saleDate", rows: byBarcodeDate };

  return { source: null, rows: [] };
}

function pickBestCandidate(excelRow, candidates, orderBySrid) {
  const evaluated = candidates.map((salesRow) => {
    const orderRow = orderBySrid.get(String(salesRow.srid)) ?? null;
    const ev = evaluateMatch(excelRow, salesRow, orderRow);
    const excelRetail = parseNum(excelRow["Вайлдберриз реализовал Товар (Пр)"]);
    const finishedDiff =
      excelRetail === null ? null : Math.abs(Number(salesRow.finishedPrice) - excelRetail);
    return { salesRow, orderRow, ...ev, finishedDiff };
  });

  evaluated.sort((a, b) => {
    if (a.allExact !== b.allExact) return a.allExact ? -1 : 1;
    if (a.finishedDiff !== null && b.finishedDiff !== null && a.finishedDiff !== b.finishedDiff) {
      return a.finishedDiff - b.finishedDiff;
    }
    return 0;
  });

  return evaluated;
}

function formatSideBySide(excelRow, salesRow, orderRow) {
  const excelNums = excelNumericFields(excelRow);
  const salesNums = salesMonetaryFields(salesRow);
  return {
    salesApiMonetary: salesNums,
    excelNumeric: excelNums,
    salesIdentifiers: {
      saleID: salesRow.saleID ?? null,
      srid: salesRow.srid ?? null,
      barcode: salesRow.barcode ?? null,
      supplierArticle: salesRow.supplierArticle ?? null,
      nmId: salesRow.nmId ?? null,
      saleDate: salesRow.date ?? null,
      orderId: orderRow?.gNumber ?? null,
      quantity: 1,
    },
    excelIdentifiers: {
      srid: excelRow.Srid ?? null,
      barcode: excelRow["Баркод"] ?? null,
      supplierArticle: excelRow["Артикул поставщика"] ?? null,
      nmId: excelRow["Код номенклатуры"] ?? null,
      saleDate: excelRow["Дата продажи"] ?? null,
      orderCartId: excelRow["Id корзины заказа"] ?? null,
      quantity: excelRow["Кол-во"] ?? null,
      rowNumber: excelRow["№"] ?? null,
    },
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Excel Sale Rows ↔ Sales API Matching Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Excel: \`${report.sources.excel}\``);
  lines.push(`Sales: \`${report.sources.sales}\` (${report.sources.salesRowCount} rows)`);
  lines.push(`Orders: \`${report.sources.orders}\` (${report.sources.ordersRowCount} rows) — orderId (\`gNumber\`) link only`);
  lines.push("");
  lines.push(`Excel sale rows (\`Обоснование для оплаты = ${SALE_OPER}\`): **${report.summary.excelSaleRows}**`);
  lines.push("");

  function renderMatch(entry, heading) {
    lines.push(`## ${heading}: Excel row №${entry.excelRowNumber} — SRID \`${entry.excelSrid}\``);
    lines.push("");
    lines.push("### Match keys");
    lines.push("");
    lines.push("| Key | Excel | Sales / Orders | Match |");
    lines.push("| --- | --- | --- | --- |");
    for (const [key, detail] of Object.entries(entry.keyComparison)) {
      lines.push(`| ${key} | ${detail.excel ?? "—"} | ${detail.sales ?? "—"} | ${detail.match ? "yes" : "no"} |`);
    }
    lines.push("");
    if (entry.alternateCandidates?.length) {
      lines.push(`_Note: ${entry.alternateCandidates.length} additional Sales API row(s) share this SRID._`);
      lines.push("");
      for (const alt of entry.alternateCandidates) {
        lines.push(`#### Alternate Sales API row: \`${alt.saleID}\``);
        lines.push("");
        lines.push("| Sales field | Value |");
        lines.push("| --- | ---: |");
        for (const [k, v] of Object.entries(alt.monetary)) {
          lines.push(`| \`${k}\` | ${v} |`);
        }
        lines.push("");
      }
    }
    lines.push("### Sales API monetary fields");
    lines.push("");
    lines.push("| Sales field | Value |");
    lines.push("| --- | ---: |");
    for (const [k, v] of Object.entries(entry.sideBySide.salesApiMonetary)) {
      lines.push(`| \`${k}\` | ${v} |`);
    }
    lines.push("");
    lines.push("### Excel numeric fields (same row)");
    lines.push("");
    lines.push("| Excel column | Value |");
    lines.push("| --- | ---: |");
    for (const [k, v] of Object.entries(entry.sideBySide.excelNumeric)) {
      lines.push(`| ${k} | ${v} |`);
    }
    lines.push("");
  }

  lines.push("# Exact Matches");
  lines.push("");
  if (report.exactMatches.length === 0) {
    lines.push("_None._");
  } else {
    for (const entry of report.exactMatches) renderMatch(entry, "Exact match");
  }
  lines.push("");

  lines.push("# Partial Matches");
  lines.push("");
  if (report.partialMatches.length === 0) {
    lines.push("_None._");
  } else {
    for (const entry of report.partialMatches) {
      renderMatch(entry, "Partial match");
      if (entry.reason) lines.push(`_Reason: ${entry.reason}_`, "");
    }
  }
  lines.push("");

  lines.push("# Missing Sales");
  lines.push("");
  if (report.missingSales.length === 0) {
    lines.push("_None._");
  } else {
    for (const entry of report.missingSales) {
      lines.push(`- Excel row №${entry.excelRowNumber}: SRID \`${entry.excelSrid}\`, barcode ${entry.barcode}, sale date ${entry.saleDate}, article ${entry.supplierArticle}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const excelPath = resolve(process.argv[2] ?? DEFAULT_EXCEL);
  const exportDir = resolve(process.argv[3] ?? DEFAULT_EXPORT_DIR);
  const outputPath = resolve(process.argv[4] ?? DEFAULT_OUTPUT);

  const wb = XLSX.read(await readFile(excelPath), { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const allExcelRows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const excelSaleRows = allExcelRows.filter((r) => r["Обоснование для оплаты"] === SALE_OPER);

  const salesEnvelope = await loadJson(resolve(exportDir, "sales.json"));
  const ordersEnvelope = await loadJson(resolve(exportDir, "orders.json"));
  const salesRows = Array.isArray(salesEnvelope.data) ? salesEnvelope.data : [];
  const ordersRows = Array.isArray(ordersEnvelope.data) ? ordersEnvelope.data : [];

  const orderBySrid = new Map();
  for (const o of ordersRows) {
    if (o?.srid) orderBySrid.set(String(o.srid), o);
  }

  const exactMatches = [];
  const partialMatches = [];
  const missingSales = [];

  for (const excelRow of excelSaleRows) {
    const excelRowNumber = excelRow["№"] ?? null;
    const excelSrid = excelRow.Srid ?? null;
    const { rows: candidates, source } = findCandidates(excelRow, salesRows);

    if (candidates.length === 0) {
      missingSales.push({
        excelRowNumber,
        excelSrid,
        barcode: excelRow["Баркод"],
        saleDate: excelRow["Дата продажи"],
        supplierArticle: excelRow["Артикул поставщика"],
      });
      continue;
    }

    const evaluated = pickBestCandidate(excelRow, candidates, orderBySrid);
    const best = evaluated[0];
    const alternates = evaluated.slice(1).filter((e) => e.allExact);

    const keyComparison = {
      barcode: {
        excel: String(excelRow["Баркод"]),
        sales: String(best.salesRow.barcode),
        match: best.checks.barcode,
      },
      supplierArticle: {
        excel: excelRow["Артикул поставщика"],
        sales: best.salesRow.supplierArticle,
        match: best.checks.supplierArticle,
      },
      nmId: {
        excel: excelRow["Код номенклатуры"],
        sales: best.salesRow.nmId,
        match: best.checks.nmId,
      },
      srid: {
        excel: excelRow.Srid,
        sales: best.salesRow.srid,
        match: best.checks.srid,
      },
      orderId: {
        excel: excelRow["Id корзины заказа"] ?? null,
        sales: best.orderRow?.gNumber ?? null,
        match: Boolean(best.orderRow?.gNumber),
        note: "Orders API gNumber linked via SRID; Excel cart id is a different identifier",
      },
      saleDate: {
        excel: excelRow["Дата продажи"],
        sales: saleDatePart(best.salesRow.date),
        match: best.checks.saleDate,
      },
      quantity: {
        excel: excelRow["Кол-во"],
        sales: 1,
        match: best.checks.quantity,
      },
    };

    const entry = {
      excelRowNumber,
      excelSrid,
      candidateSource: source,
      keyComparison,
      sideBySide: formatSideBySide(excelRow, best.salesRow, best.orderRow),
      matchedSalesRow: best.salesRow,
      alternateCandidates: alternates.map((a) => ({
        saleID: a.salesRow.saleID,
        finishedPrice: a.salesRow.finishedPrice,
        forPay: a.salesRow.forPay,
        monetary: salesMonetaryFields(a.salesRow),
        salesRow: a.salesRow,
      })),
    };

    const allExactCount = evaluated.filter((e) => e.allExact).length;
    if (best.allExact && allExactCount === 1) {
      exactMatches.push(entry);
    } else {
      entry.reason =
        allExactCount > 1
          ? `${allExactCount} Sales API rows match all identity keys (ambiguous SRID)`
          : `Failed keys: ${best.failed.join(", ")}`;
      partialMatches.push(entry);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sources: {
      excel: excelPath,
      sales: resolve(exportDir, "sales.json"),
      orders: resolve(exportDir, "orders.json"),
      salesRowCount: salesRows.length,
      ordersRowCount: ordersRows.length,
      salesAccountId: salesEnvelope.metadata?.accountId ?? null,
    },
    summary: {
      excelSaleRows: excelSaleRows.length,
      exactMatches: exactMatches.length,
      partialMatches: partialMatches.length,
      missingSales: missingSales.length,
    },
    exactMatches,
    partialMatches,
    missingSales,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buildMarkdown(report), "utf8");
  await writeFile(
    outputPath.replace(/\.md$/i, ".json"),
    JSON.stringify(report, null, 2),
    "utf8",
  );

  console.log(`Wrote ${outputPath}`);
  console.log(
    `  exact: ${report.summary.exactMatches}, partial: ${report.summary.partialMatches}, missing: ${report.summary.missingSales}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
