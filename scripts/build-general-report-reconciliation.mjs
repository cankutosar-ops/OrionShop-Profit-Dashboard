#!/usr/bin/env node
/**
 * Accounting proof — General Financial Report Excel vs finance.json.
 * Mathematical comparison only. No application code changes.
 *
 * Usage:
 *   node scripts/build-general-report-reconciliation.mjs [excelPath] [financePath] [outputPath]
 */
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { resolve, dirname } from "path";
import * as XLSX from "xlsx";

const TOLERANCE = 0.01;
const DEFAULT_FINANCE = "exports/wb-raw-2026-06-18_2026-06-29/finance.json";
const DEFAULT_OUTPUT = "exports/general-report-reconciliation.md";
const DEFAULT_EXCEL_CANDIDATES = [
  "exports/general-financial-report.xlsx",
  "c:/Users/User/Downloads/Еженедельный детализированный отчет №772388604_68674 - 1.xlsx",
];

/** Order matters — more specific patterns first */
const EXCEL_HEADER_TO_FIELD = [
  { patterns: ["обоснование для оплаты"], field: "supplier_oper_name", monetary: false },
  { patterns: ["srid"], field: "srid", monetary: false },
  { patterns: ["баркод"], field: "barcode", monetary: false },
  { patterns: ["артикул поставщика"], field: "sa_name", monetary: false },
  { patterns: ["дата продажи"], field: "sale_dt", monetary: false },
  { patterns: ["дата заказа"], field: "order_dt", monetary: false },
  { patterns: ["вознаграждение с продаж до вычета услуг поверенного"], field: "ppvz_sales_commission", monetary: true },
  { patterns: ["ндс с вознаграждения"], field: "ppvz_vw_nds", monetary: true },
  { patterns: ["цена розничная с учетом", "цена розничная с учётом"], field: "retail_price_withdisc_rub", monetary: true },
  { patterns: ["вайлдберриз реализовал", "wb реализовал"], field: "retail_amount", monetary: true },
  { patterns: ["к перечислению продавцу", "к перечислению pro"], field: "ppvz_for_pay", monetary: true },
  { patterns: ["возмещение за выдачу"], field: "ppvz_reward", monetary: true },
  { patterns: ["компенсация платёжных", "компенсация платежных", "эквайринг"], field: "acquiring_fee", monetary: true },
  { patterns: ["услуги по доставке"], field: "delivery_rub", monetary: true },
  { patterns: ["общая сумма штрафов"], field: "penalty", monetary: true },
  { patterns: ["доплаты"], field: "additional_payment", monetary: true },
  { patterns: ["стоимость хранения"], field: "storage_fee", monetary: true },
  { patterns: ["стоимость платной приемки", "платной приёмки"], field: "acceptance", monetary: true },
  { patterns: ["прочие удержания"], field: "deduction", monetary: true },
  { patterns: ["возмещение издержек по перевозке", "перевыставление расходов"], field: "rebill_logistic_cost", monetary: true },
  { patterns: ["цена розничная"], field: "retail_price", monetary: true },
  { patterns: ["вознаграждение вайлдберриз", "вознаграждение wb"], field: "ppvz_vw", monetary: true },
  { patterns: ["кол-во", "количество"], field: "quantity", monetary: false },
];

const FINANCE_MONETARY_FIELDS = [
  "retail_price",
  "retail_amount",
  "retail_price_withdisc_rub",
  "ppvz_sales_commission",
  "ppvz_reward",
  "ppvz_vw",
  "ppvz_vw_nds",
  "acquiring_fee",
  "ppvz_for_pay",
  "delivery_rub",
  "rebill_logistic_cost",
  "storage_fee",
  "penalty",
  "additional_payment",
  "deduction",
  "acceptance",
  "product_discount_for_report",
  "supplier_promo",
  "installment_cofinancing_amount",
  "cashback_amount",
  "cashback_discount",
  "cashback_commission_change",
  "seller_promo_discount",
  "loyalty_discount",
];

function round2(n) {
  return Math.round(n * 100) / 100;
}

function closeEnough(a, b) {
  return Math.abs(a - b) <= TOLERANCE;
}

function parseNum(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function matchField(header) {
  const h = normHeader(header);
  if (!h) return null;
  for (const { patterns, field } of EXCEL_HEADER_TO_FIELD) {
    if (patterns.some((p) => h.includes(p))) return field;
  }
  return null;
}

function datePart(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function isMonetaryExcelColumn(rows, header) {
  let numeric = 0;
  let nonZero = 0;
  for (const row of rows) {
    const v = row.raw[header];
    if (v == null || v === "") continue;
    if (typeof v === "number" || /^-?\d+([.,]\d+)?$/.test(String(v).replace(/\s/g, ""))) {
      numeric++;
      if (Math.abs(parseNum(v)) > TOLERANCE) nonZero++;
    }
  }
  return numeric > 0 && (nonZero > 0 || matchField(header));
}

function sumRawColumn(rows, header) {
  return round2(rows.reduce((s, r) => s + parseNum(r.raw[header]), 0));
}

function sumFinanceField(rows, field) {
  return round2(rows.reduce((s, r) => s + parseNum(r[field]), 0));
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

  const rows = jsonRows.map((raw, idx) => {
    const mapped = {};
    const headerMap = {};
    for (const [header, val] of Object.entries(raw)) {
      const field = matchField(header);
      headerMap[header] = field;
      if (field && field !== "supplier_oper_name") {
        if (field === "sale_dt" || field === "order_dt") mapped[field] = datePart(val);
        else if (field === "sa_name" || field === "barcode" || field === "srid") mapped[field] = String(val ?? "").trim();
        else mapped[field] = parseNum(val);
      }
    }
    mapped.supplier_oper_name = String(raw["Обоснование для оплаты"] ?? "").trim();
    mapped.srid = String(raw["Srid"] ?? raw["srid"] ?? mapped.srid ?? "").trim();
    mapped.barcode = String(raw["Баркод"] ?? mapped.barcode ?? "").trim();
    mapped.sa_name = String(raw["Артикул поставщика"] ?? mapped.sa_name ?? "").trim();
    mapped.sale_dt = datePart(raw["Дата продажи"] ?? mapped.sale_dt);
    mapped.order_dt = datePart(raw["Дата заказа покупателем"] ?? mapped.order_dt);
    return { excelRowIndex: idx + 1, raw, headerMap, mapped };
  });

  const monetaryHeaders = Object.keys(rows[0]?.raw ?? {}).filter((h) => isMonetaryExcelColumn(rows, h));
  return { rows, monetaryHeaders, sheetName: wb.SheetNames[0] };
}

function primaryAmountForOper(mapped, oper) {
  if (oper === "Логистика") return mapped.delivery_rub ?? 0;
  if (oper === "Продажа" || oper === "Возврат") return mapped.retail_amount ?? mapped.ppvz_for_pay ?? 0;
  if (oper === "Хранение") return mapped.storage_fee ?? 0;
  return mapped.ppvz_for_pay ?? mapped.delivery_rub ?? mapped.retail_amount ?? 0;
}

function scoreFinanceCandidate(excelRow, finRow, requireSrid = true) {
  let score = 0;
  const m = excelRow.mapped;
  if (m.srid && finRow.srid) {
    if (String(m.srid) === String(finRow.srid)) score += 100;
    else if (requireSrid) return -1;
  }

  if (m.supplier_oper_name && finRow.supplier_oper_name === m.supplier_oper_name) score += 20;
  else return -1;

  if (m.barcode && String(finRow.barcode) === m.barcode) score += 15;
  if (m.sa_name && String(finRow.sa_name) === m.sa_name) score += 10;
  if (m.sale_dt && datePart(finRow.sale_dt) === m.sale_dt) score += 10;
  if (m.order_dt && datePart(finRow.order_dt) === m.order_dt) score += 5;

  const primary = primaryAmountForOper(m, m.supplier_oper_name);
  const finPrimary = primaryAmountForOper(
    {
      delivery_rub: finRow.delivery_rub,
      retail_amount: finRow.retail_amount,
      ppvz_for_pay: finRow.ppvz_for_pay,
      storage_fee: finRow.storage_fee,
    },
    m.supplier_oper_name,
  );
  if (closeEnough(primary, finPrimary)) score += 25;

  return score;
}

function findBestFinanceMatch(excelRow, financeRows) {
  const m = excelRow.mapped;
  const sridMatches = m.srid ? financeRows.filter((f) => String(f.srid) === String(m.srid)) : [];

  let candidates = sridMatches;
  if (candidates.length === 0) {
    candidates = financeRows.filter((f) => {
      if (f.supplier_oper_name !== m.supplier_oper_name) return false;
      if (m.barcode && String(f.barcode) !== m.barcode) return false;
      if (m.sa_name && String(f.sa_name) !== m.sa_name) return false;
      if (m.sale_dt && datePart(f.sale_dt) !== m.sale_dt && datePart(f.rr_dt) !== m.sale_dt) return false;
      const primary = primaryAmountForOper(m, m.supplier_oper_name);
      const finPrimary = primaryAmountForOper(
        {
          delivery_rub: f.delivery_rub,
          retail_amount: f.retail_amount,
          ppvz_for_pay: f.ppvz_for_pay,
          storage_fee: f.storage_fee,
        },
        m.supplier_oper_name,
      );
      return closeEnough(primary, finPrimary);
    });
  }

  let best = null;
  let bestScore = -1;
  for (const finRow of candidates) {
    const score = scoreFinanceCandidate(excelRow, finRow, sridMatches.length > 0);
    if (score > bestScore) {
      bestScore = score;
      best = finRow;
    }
  }

  if (!best) return null;
  const matchMethod = sridMatches.length > 0 ? "srid" : "composite";
  const minScore = matchMethod === "srid" ? 100 : 50;
  return bestScore >= minScore ? { financeRow: best, score: bestScore, matchMethod } : null;
}

function compareRowFields(excelRow, financeRow) {
  const pairs = [];
  for (const [header, field] of Object.entries(excelRow.headerMap)) {
    if (!field || !FINANCE_MONETARY_FIELDS.includes(field)) continue;
    const excelVal = parseNum(excelRow.raw[header]);
    const financeVal = parseNum(financeRow[field]);
    pairs.push({
      excelHeader: header,
      financeField: field,
      excelValue: excelVal,
      financeValue: financeVal,
      difference: round2(excelVal - financeVal),
      exact: closeEnough(excelVal, financeVal),
    });
  }
  return pairs;
}

function detectConstantDifferences(rowComparisons) {
  const byField = new Map();
  for (const rc of rowComparisons) {
    if (!rc.financeRow) continue;
    for (const p of rc.fieldPairs) {
      if (p.exact) continue;
      const key = `${p.excelHeader}|${p.financeField}`;
      if (!byField.has(key)) byField.set(key, []);
      byField.get(key).push(p.difference);
    }
  }
  const constant = [];
  for (const [key, diffs] of byField.entries()) {
    if (diffs.length < 2) continue;
    const first = diffs[0];
    if (diffs.every((d) => closeEnough(d, first))) {
      const [excelHeader, financeField] = key.split("|");
      constant.push({ excelHeader, financeField, constantDifference: first, rowCount: diffs.length });
    }
  }
  return constant;
}

function detectRowFormulas(rowComparisons) {
  const proven = [];
  const fields = FINANCE_MONETARY_FIELDS;
  const matched = rowComparisons.filter((r) => r.financeRow);
  if (matched.length === 0) return proven;

  function rowVal(rc, field) {
    const pair = rc.fieldPairs.find((p) => p.financeField === field);
    return pair ? pair.excelValue : parseNum(rc.financeRow[field]);
  }

  for (const a of fields) {
    for (const b of fields) {
      if (b === a) continue;
      for (const c of fields) {
        if (c === a || c === b) continue;
        if (matched.every((rc) => closeEnough(rowVal(rc, a), rowVal(rc, b) + rowVal(rc, c)))) {
          proven.push({ equation: `${a} = ${b} + ${c}`, rowCount: matched.length });
        }
        if (matched.every((rc) => closeEnough(rowVal(rc, a), rowVal(rc, b) - rowVal(rc, c)))) {
          proven.push({ equation: `${a} = ${b} - ${c}`, rowCount: matched.length });
        }
      }
    }
  }
  return proven;
}

function buildFieldTotalComparisons(excelRows, financeRows, monetaryHeaders) {
  const comparisons = [];
  const financeFields = FINANCE_MONETARY_FIELDS;

  for (const header of monetaryHeaders) {
    const excelTotal = sumRawColumn(excelRows, header);
    const canonicalField = matchField(header);
    for (const financeField of financeFields) {
      const financeTotal = sumFinanceField(financeRows, financeField);
      const diff = round2(excelTotal - financeTotal);
      comparisons.push({
        excelHeader: header,
        canonicalFinanceField: canonicalField,
        financeField,
        excelTotal,
        financeTotal,
        difference: diff,
        exact: closeEnough(excelTotal, financeTotal),
        canonical: canonicalField === financeField,
      });
    }
  }
  return comparisons;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# General Report Reconciliation — Accounting Proof");
  lines.push("");
  lines.push(`Generated: ${report.metadata.generatedAt}`);
  lines.push(`Tolerance: ±${TOLERANCE} RUB`);
  lines.push(`Excel: \`${report.metadata.excelPath}\` (${report.metadata.excelRowCount} rows)`);
  lines.push(`Finance: \`${report.metadata.financePath}\` (${report.metadata.financeRowCount} rows)`);
  lines.push("");

  if (report.metadata.evidenceNotes.length) {
    lines.push("## Evidence notes");
    lines.push("");
    for (const n of report.metadata.evidenceNotes) lines.push(`- ${n}`);
    lines.push("");
  }

  lines.push("# Exact Field Matches");
  lines.push("");
  const canonicalExact = report.exactFieldMatches.filter((m) => m.canonical);
  const crossExactNonZero = report.exactFieldMatches.filter(
    (m) => !m.canonical && (Math.abs(m.excelTotal) > TOLERANCE || Math.abs(m.financeTotal) > TOLERANCE),
  );
  const crossExactZero = report.exactFieldMatches.filter(
    (m) => !m.canonical && Math.abs(m.excelTotal) <= TOLERANCE && Math.abs(m.financeTotal) <= TOLERANCE,
  );

  lines.push("## Canonical column mapping (Excel header → mapped finance field)");
  lines.push("");
  if (canonicalExact.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| Excel column | Finance field | Excel total | Finance total | Diff |");
    lines.push("| --- | --- | ---: | ---: | ---: |");
    for (const m of canonicalExact) {
      lines.push(`| ${m.excelHeader} | \`${m.financeField}\` | ${m.excelTotal} | ${m.financeTotal} | ${m.difference} |`);
    }
  }
  lines.push("");

  if (crossExactNonZero.length) {
    lines.push("## Cross-field exact totals (non-zero)");
    lines.push("");
    lines.push("| Excel column | Finance field | Excel total | Finance total | Diff |");
    lines.push("| --- | --- | ---: | ---: | ---: |");
    for (const m of crossExactNonZero) {
      lines.push(`| ${m.excelHeader} | \`${m.financeField}\` | ${m.excelTotal} | ${m.financeTotal} | ${m.difference} |`);
    }
    lines.push("");
  }

  if (crossExactZero.length) {
    lines.push(`## Cross-field exact totals (0.00 = 0.00): ${crossExactZero.length} pairs _(see JSON for full list)_`);
    lines.push("");
  }

  lines.push("# Exact Row Matches");
  lines.push("");
  if (report.exactRowMatches.length === 0) {
    lines.push("_None._");
  } else {
    for (const r of report.exactRowMatches) {
      lines.push(`## Excel row ${r.excelRowIndex} ↔ Finance rrd_id ${r.financeRrdId}`);
      lines.push("");
      lines.push(`- SRID: \`${r.srid}\``);
      lines.push(`- Finance SRID: \`${r.financeSrid}\``);
      lines.push(`- Operation: ${r.operation}`);
      lines.push(`- Match method: ${r.matchMethod}`);
      lines.push(`- Match score: ${r.score}`);
      lines.push(`- All mapped monetary fields exact: **yes**`);
      lines.push("");
    }
  }

  if (report.partialRowMatches.length) {
    lines.push("## Partial row matches (finance row found, not all fields exact)");
    lines.push("");
    for (const r of report.partialRowMatches.slice(0, 30)) {
      lines.push(`### Excel row ${r.excelRowIndex} ↔ Finance rrd_id ${r.financeRrdId} (SRID \`${r.srid}\`)`);
      lines.push("");
      lines.push("| Excel column | Finance field | Excel | Finance | Diff | Exact |");
      lines.push("| --- | --- | ---: | ---: | ---: | --- |");
      for (const p of r.fieldPairs) {
        lines.push(
          `| ${p.excelHeader} | \`${p.financeField}\` | ${p.excelValue} | ${p.financeValue} | ${p.difference} | ${p.exact ? "yes" : "no"} |`,
        );
      }
      lines.push("");
    }
  }

  if (report.unmatchedExcelRows.length) {
    lines.push("## Unmatched Excel rows");
    lines.push("");
    for (const r of report.unmatchedExcelRows) {
      lines.push(
        `- Row ${r.excelRowIndex}: SRID \`${r.srid}\`, ${r.operation}, barcode ${r.barcode}, sale ${r.sale_dt}, amount ${r.primaryAmount}`,
      );
    }
    lines.push("");
  }

  lines.push("# Fields With Constant Difference");
  lines.push("");
  if (report.constantDifferences.length === 0) {
    lines.push("_None among matched rows._");
  } else {
    lines.push("| Excel column | Finance field | Constant diff | Matched rows |");
    lines.push("| --- | --- | ---: | ---: |");
    for (const c of report.constantDifferences) {
      lines.push(`| ${c.excelHeader} | \`${c.financeField}\` | ${c.constantDifference} | ${c.rowCount} |`);
    }
  }
  lines.push("");

  lines.push("# Fields Requiring Formula");
  lines.push("");
  lines.push("_Proven row-level equations (100% of matched rows, ±0.01 RUB)._");
  lines.push("");
  if (report.rowFormulas.length === 0) {
    lines.push("_None._");
  } else {
    for (const f of report.rowFormulas) {
      lines.push(`- \`${f.equation}\` (${f.rowCount} rows)`);
    }
  }
  lines.push("");

  lines.push("# Unknown Relationships");
  lines.push("");
  if (report.unknownRelationships.length === 0) {
    lines.push("_None._");
  } else {
    for (const u of report.unknownRelationships) lines.push(`- ${u}`);
  }
  lines.push("");

  lines.push("# Field Total Differences (non-exact, canonical mapping)");
  lines.push("");
  const canonicalDiffs = report.fieldTotalComparisons.filter(
    (c) => c.canonical && !c.exact && (Math.abs(c.excelTotal) > TOLERANCE || Math.abs(c.financeTotal) > TOLERANCE),
  );
  if (canonicalDiffs.length === 0) {
    lines.push("_None with non-zero totals._");
  } else {
    lines.push("| Excel column | Finance field | Excel total | Finance total | Diff |");
    lines.push("| --- | --- | ---: | ---: | ---: |");
    for (const d of canonicalDiffs) {
      lines.push(`| ${d.excelHeader} | \`${d.financeField}\` | ${d.excelTotal} | ${d.financeTotal} | ${d.difference} |`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function findExcelPath(explicit, cwd) {
  if (explicit) return resolve(cwd, explicit);
  for (const p of DEFAULT_EXCEL_CANDIDATES) {
    try {
      await access(resolve(cwd, p));
      return resolve(cwd, p);
    } catch {
      try {
        await access(p);
        return p;
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

async function main() {
  const cwd = process.cwd();
  const excelPath = await findExcelPath(process.argv[2] ?? null, cwd);
  const financePath = resolve(cwd, process.argv[3] ?? DEFAULT_FINANCE);
  const outputPath = resolve(cwd, process.argv[4] ?? DEFAULT_OUTPUT);
  const jsonPath = outputPath.replace(/\.md$/i, ".json");

  if (!excelPath) throw new Error("Excel file not found");

  const financeSource = JSON.parse(await readFile(financePath, "utf8"));
  const financeRows = financeSource.data ?? [];
  const excelBuffer = await readFile(excelPath);
  const excel = parseExcel(excelBuffer);

  const evidenceNotes = [];
  const excelDates = [...new Set(excel.rows.map((r) => r.mapped.sale_dt).filter(Boolean))].sort();
  const financeDates = [...new Set(financeRows.map((r) => datePart(r.rr_dt || r.sale_dt)).filter(Boolean))].sort();
  evidenceNotes.push(`Excel row count: ${excel.rows.length}; Finance row count: ${financeRows.length}`);
  evidenceNotes.push(`Excel sale dates: ${excelDates.join(", ") || "(none)"}`);
  evidenceNotes.push(`Finance rr_dt/sale_dt range: ${financeDates[0] ?? "?"} → ${financeDates[financeDates.length - 1] ?? "?"}`);
  if (excel.rows.length !== financeRows.length) {
    evidenceNotes.push("Row count mismatch between Excel and finance.json");
  }

  const fieldTotalComparisons = buildFieldTotalComparisons(excel.rows, financeRows, excel.monetaryHeaders);

  const exactFieldMatches = fieldTotalComparisons.filter((c) => c.exact);
  const exactFieldMatchesCanonical = exactFieldMatches.filter((c) => c.canonical);
  const exactFieldMatchesCross = exactFieldMatches.filter((c) => !c.canonical);

  const rowComparisons = [];
  const exactRowMatches = [];
  const partialRowMatches = [];
  const unmatchedExcelRows = [];

  for (const excelRow of excel.rows) {
    const match = findBestFinanceMatch(excelRow, financeRows);
    if (!match) {
      unmatchedExcelRows.push({
        excelRowIndex: excelRow.excelRowIndex,
        srid: excelRow.mapped.srid,
        operation: excelRow.mapped.supplier_oper_name,
        barcode: excelRow.mapped.barcode,
        sale_dt: excelRow.mapped.sale_dt,
        primaryAmount: primaryAmountForOper(excelRow.mapped, excelRow.mapped.supplier_oper_name),
      });
      rowComparisons.push({ excelRow, financeRow: null, fieldPairs: [] });
      continue;
    }

    const fieldPairs = compareRowFields(excelRow, match.financeRow);
    const rowRec = {
      excelRowIndex: excelRow.excelRowIndex,
      srid: excelRow.mapped.srid,
      operation: excelRow.mapped.supplier_oper_name,
      financeRrdId: match.financeRow.rrd_id,
      financeSrid: match.financeRow.srid,
      score: match.score,
      matchMethod: match.matchMethod,
      fieldPairs,
    };

    if (fieldPairs.length > 0 && fieldPairs.every((p) => p.exact)) {
      exactRowMatches.push(rowRec);
    } else {
      partialRowMatches.push(rowRec);
    }
    rowComparisons.push({ excelRow, financeRow: match.financeRow, fieldPairs });
  }

  const constantDifferences = detectConstantDifferences(rowComparisons);
  const rowFormulas = detectRowFormulas(rowComparisons);

  const unknownRelationships = [];
  if (unmatchedExcelRows.length === excel.rows.length) {
    unknownRelationships.push("Zero Excel SRIDs found in finance.json");
    unknownRelationships.push(
      `Finance API date range in export: ${financeDates[0] ?? "?"} → ${financeDates[financeDates.length - 1] ?? "?"}`,
    );
    unknownRelationships.push("Zero Excel barcodes found in finance.json — possible different WB account or report scope");
  } else if (unmatchedExcelRows.length > 0) {
    unknownRelationships.push(`${unmatchedExcelRows.length} Excel rows had no finance.json match`);
  }
  for (const h of excel.monetaryHeaders) {
    if (!matchField(h)) unknownRelationships.push(`Unmapped monetary Excel column: "${h}"`);
  }
  if (exactFieldMatchesCanonical.length === 0 && excel.rows.length < financeRows.length) {
    unknownRelationships.push(
      "Canonical field totals do not reconcile — likely different report scope or accounting period",
    );
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      toleranceRub: TOLERANCE,
      excelPath,
      excelRowCount: excel.rows.length,
      financePath,
      financeRowCount: financeRows.length,
      evidenceNotes,
    },
    fieldTotalComparisons,
    exactFieldMatches: exactFieldMatches.sort((a, b) => {
      if (a.canonical !== b.canonical) return a.canonical ? -1 : 1;
      return Math.abs(b.excelTotal) - Math.abs(a.excelTotal);
    }),
    exactFieldMatchesCanonical,
    exactFieldMatchesCross,
    exactRowMatches,
    partialRowMatches,
    unmatchedExcelRows,
    constantDifferences,
    rowFormulas,
    unknownRelationships,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buildMarkdown(report), "utf8");
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`  excel rows: ${excel.rows.length}`);
  console.log(`  finance rows: ${financeRows.length}`);
  console.log(`  exact field matches: ${exactFieldMatches.length} (canonical: ${exactFieldMatchesCanonical.length})`);
  console.log(`  exact row matches: ${exactRowMatches.length}`);
  console.log(`  unmatched excel rows: ${unmatchedExcelRows.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
