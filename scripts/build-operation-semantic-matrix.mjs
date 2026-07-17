#!/usr/bin/env node
/**
 * Temporary — operation semantic matrix from finance.json only.
 * No application code changes. No cross-operation aggregation.
 *
 * Usage:
 *   node scripts/build-operation-semantic-matrix.mjs [financePath] [outputBase]
 *
 * Default:
 *   financePath = exports/wb-raw-2026-06-18_2026-06-29/finance.json
 *   outputBase  = exports/operation-semantic-matrix
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";

const DEFAULT_FINANCE = "exports/wb-raw-2026-06-18_2026-06-29/finance.json";
const DEFAULT_OUTPUT_BASE = "exports/operation-semantic-matrix";

const EXAMPLE_VALUE_LIMIT = 5;
const EXAMPLE_SRID_LIMIT = 5;

/** Fields treated as monetary amounts (not counts, IDs, or percentages). */
const MONETARY_FIELDS = new Set([
  "retail_price",
  "retail_amount",
  "retail_price_withdisc_rub",
  "delivery_rub",
  "rebill_logistic_cost",
  "storage_fee",
  "penalty",
  "additional_payment",
  "deduction",
  "acceptance",
  "ppvz_sales_commission",
  "ppvz_for_pay",
  "ppvz_reward",
  "ppvz_vw",
  "ppvz_vw_nds",
  "acquiring_fee",
  "product_discount_for_report",
  "supplier_promo",
  "installment_cofinancing_amount",
  "cashback_amount",
  "cashback_discount",
  "cashback_commission_change",
  "seller_promo_discount",
  "loyalty_discount",
]);

function isMonetaryField(name) {
  return MONETARY_FIELDS.has(name);
}

function isNumericField(rows, field) {
  for (const row of rows) {
    const v = row[field];
    if (v == null) continue;
    if (typeof v !== "number") return false;
  }
  return rows.some((row) => typeof row[field] === "number");
}

function round6(n) {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function analyzeField(rows, field) {
  const totalRows = rows.length;
  const values = [];
  const examplesByValue = new Map();

  for (const row of rows) {
    const v = row[field];
    if (v == null) continue;
    values.push(v);
    const key = String(v);
    if (!examplesByValue.has(key)) {
      examplesByValue.set(key, { value: v, srids: [] });
    }
    const bucket = examplesByValue.get(key);
    if (bucket.srids.length < EXAMPLE_SRID_LIMIT && row.srid) {
      bucket.srids.push(String(row.srid));
    }
  }

  const nonNullCount = values.length;
  const populatedPct = totalRows === 0 ? 0 : round6((nonNullCount / totalRows) * 100);

  let min = null;
  let max = null;
  let average = null;
  if (nonNullCount > 0) {
    min = Math.min(...values);
    max = Math.max(...values);
    average = round6(values.reduce((s, x) => s + x, 0) / nonNullCount);
  }

  const sortedExamples = [...examplesByValue.values()].sort((a, b) => {
    const av = a.value;
    const bv = b.value;
    if (av !== 0 && bv === 0) return -1;
    if (av === 0 && bv !== 0) return 1;
    return bv - av;
  });

  const exampleValues = sortedExamples.slice(0, EXAMPLE_VALUE_LIMIT).map((x) => x.value);
  const exampleSrids = [];
  for (const ex of sortedExamples) {
    for (const srid of ex.srids) {
      if (exampleSrids.length >= EXAMPLE_SRID_LIMIT) break;
      if (!exampleSrids.includes(srid)) exampleSrids.push(srid);
    }
    if (exampleSrids.length >= EXAMPLE_SRID_LIMIT) break;
  }

  return {
    field,
    nonNullCount,
    populatedPct,
    min,
    max,
    average,
    isMonetary: isMonetaryField(field),
    monetaryPopulated: isMonetaryField(field) && nonNullCount > 0,
    exampleValues,
    exampleSrids,
  };
}

function analyzeOperation(operationName, rows) {
  const fieldNames = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) fieldNames.add(key);
  }

  const numericFields = [...fieldNames].filter((f) => isNumericField(rows, f)).sort();

  const fieldStats = numericFields.map((field) => analyzeField(rows, field));
  const populatedMonetaryFields = fieldStats
    .filter((f) => f.isMonetary && f.nonNullCount > 0)
    .map((f) => f.field);

  const monetaryFieldsWithNonZeroValues = fieldStats
    .filter(
      (f) =>
        f.isMonetary &&
        f.nonNullCount > 0 &&
        ((f.min != null && f.min !== 0) || (f.max != null && f.max !== 0)),
    )
    .map((f) => f.field);

  return {
    operation: operationName,
    rowCount: rows.length,
    numericFieldCount: numericFields.length,
    numericFields,
    fieldStats,
    populatedMonetaryFields,
    monetaryFieldsWithNonZeroValues,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Operation Semantic Matrix");
  lines.push("");
  lines.push(`Generated: ${report.metadata.generatedAt}`);
  lines.push(`Source: \`${report.metadata.sourceFile}\``);
  lines.push(`Total finance rows: ${report.metadata.totalFinanceRows}`);
  lines.push(`Operation types: ${report.operations.length}`);
  lines.push("");
  lines.push(
    "> Per-operation analysis from finance.json only. No cross-operation aggregation. Populated % = non-null count / operation row count.",
  );
  lines.push("");

  for (const op of report.operations) {
    lines.push(`## ${op.operation}`);
    lines.push("");
    lines.push(`Rows: **${op.rowCount}** | Numeric fields: **${op.numericFieldCount}**`);
    lines.push("");

    if (op.monetaryFieldsWithNonZeroValues.length > 0) {
      lines.push("**Monetary fields with non-zero values:**");
      for (const f of op.monetaryFieldsWithNonZeroValues) {
        const stat = op.fieldStats.find((s) => s.field === f);
        lines.push(`- \`${f}\` (min: ${stat.min}, max: ${stat.max}, avg: ${stat.average})`);
      }
      lines.push("");
    } else {
      lines.push("_No monetary fields with non-zero values in this operation._");
      lines.push("");
    }

    if (op.populatedMonetaryFields.length > op.monetaryFieldsWithNonZeroValues.length) {
      lines.push(
        `**All populated monetary fields (non-null schema):** ${op.populatedMonetaryFields.map((f) => `\`${f}\``).join(", ")}`,
      );
      lines.push("");
    }

    lines.push("### Field matrix");
    lines.push("");
    lines.push(
      "| Field | Non-null | Populated % | Min | Max | Avg | Monetary | Example Values | Example SRIDs |",
    );
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |");

    for (const f of op.fieldStats) {
      const exVals = f.exampleValues.map((v) => `\`${v}\``).join(", ") || "—";
      const exSrids = f.exampleSrids.map((s) => `\`${s}\``).join(", ") || "—";
      lines.push(
        `| \`${f.field}\` | ${f.nonNullCount} | ${f.populatedPct}% | ${f.min ?? "—"} | ${f.max ?? "—"} | ${f.average ?? "—"} | ${f.isMonetary ? "yes" : "no"} | ${exVals} | ${exSrids} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const cwd = process.cwd();
  const financePath = resolve(cwd, process.argv[2] ?? DEFAULT_FINANCE);
  const outputBase = resolve(cwd, process.argv[3] ?? DEFAULT_OUTPUT_BASE);
  const jsonPath = `${outputBase}.json`;
  const mdPath = `${outputBase}.md`;

  const source = JSON.parse(await readFile(financePath, "utf8"));
  const rows = source.data ?? [];

  const byOperation = new Map();
  for (const row of rows) {
    const op = row.supplier_oper_name ?? "(empty)";
    if (!byOperation.has(op)) byOperation.set(op, []);
    byOperation.get(op).push(row);
  }

  const operations = [...byOperation.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, groupRows]) => analyzeOperation(name, groupRows));

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFile: financePath,
      sourceMetadata: source.metadata ?? null,
      totalFinanceRows: rows.length,
      operationCount: operations.length,
      monetaryFieldDefinition: [...MONETARY_FIELDS],
      note: "One section per supplier_oper_name. Numeric fields only. Populated % uses non-null values (0 counts as populated).",
    },
    operations,
  };

  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, buildMarkdown(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`  operations: ${operations.length}`);
  for (const op of operations) {
    console.log(
      `  ${op.operation}: ${op.rowCount} rows, ${op.monetaryFieldsWithNonZeroValues.length} active monetary fields`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
