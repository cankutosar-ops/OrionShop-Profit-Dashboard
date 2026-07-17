#!/usr/bin/env node
/**
 * Temporary — statistical investigation report from accounting-reconciliation.json.
 * No application code changes. No profit calculations. Dataset description only.
 *
 * Usage:
 *   node scripts/build-accounting-investigation-report.mjs [inputPath] [outputBase]
 *
 * Default:
 *   inputPath  = exports/accounting-reconciliation.json
 *   outputBase = exports/accounting-investigation-report
 *   → exports/accounting-investigation-report.json
 *   → exports/accounting-investigation-report.md
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";

const DEFAULT_INPUT = "exports/accounting-reconciliation.json";
const DEFAULT_OUTPUT_BASE = "exports/accounting-investigation-report";

function hasAttachment(value) {
  return value != null;
}

function financeRowCountBucket(count) {
  if (count >= 5) return "5+";
  return String(count);
}

function exampleBucketKey(count) {
  if (count >= 5) return "5+";
  return String(count);
}

async function main() {
  const cwd = process.cwd();
  const inputPath = resolve(cwd, process.argv[2] ?? DEFAULT_INPUT);
  const outputBase = resolve(cwd, process.argv[3] ?? DEFAULT_OUTPUT_BASE);
  const jsonPath = `${outputBase}.json`;
  const mdPath = `${outputBase}.md`;

  const source = JSON.parse(await readFile(inputPath, "utf8"));
  const records = source.data ?? [];
  const financeWithoutSrid = source.financeWithoutSrid ?? [];

  // --- 1. Finance rows per SRID distribution ---
  const financeRowsPerSrid = new Map();
  for (const rec of records) {
    const n = rec.finance?.length ?? 0;
    financeRowsPerSrid.set(n, (financeRowsPerSrid.get(n) ?? 0) + 1);
  }

  const financeRowsPerSridDistribution = [...financeRowsPerSrid.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([financeRowCount, sridCount]) => ({ financeRowCount, sridCount }));

  // --- 2 & 3. supplier_oper_name distribution with attachment stats ---
  /** @type {Map<string, { totalRows: number, withSale: number, withOrder: number, financeOnly: number }>} */
  const byOperName = new Map();

  function bumpOper(operName, hasSale, hasOrder) {
    const key = operName ?? "(empty)";
    if (!byOperName.has(key)) {
      byOperName.set(key, { totalRows: 0, withSale: 0, withOrder: 0, financeOnly: 0 });
    }
    const row = byOperName.get(key);
    row.totalRows += 1;
    if (hasSale) row.withSale += 1;
    if (hasOrder) row.withOrder += 1;
    if (!hasSale && !hasOrder) row.financeOnly += 1;
  }

  for (const rec of records) {
    const hasSale = hasAttachment(rec.sale);
    const hasOrder = hasAttachment(rec.order);
    for (const fin of rec.finance ?? []) {
      bumpOper(fin.supplier_oper_name, hasSale, hasOrder);
    }
  }

  for (const fin of financeWithoutSrid) {
    bumpOper(fin.supplier_oper_name, false, false);
  }

  const supplierOperNameStats = [...byOperName.entries()]
    .sort((a, b) => b[1].totalRows - a[1].totalRows)
    .map(([supplierOperName, stats]) => ({ supplierOperName, ...stats }));

  const supplierOperNameCounts = supplierOperNameStats.map(({ supplierOperName, totalRows }) => ({
    supplierOperName,
    count: totalRows,
  }));

  // --- 4. Top 50 SRIDs by finance event count ---
  const top50SridsByFinanceEvents = records
    .map((rec) => ({
      srid: rec.srid,
      financeEventCount: rec.finance?.length ?? 0,
      hasOrder: hasAttachment(rec.order),
      hasSale: hasAttachment(rec.sale),
    }))
    .sort((a, b) => b.financeEventCount - a.financeEventCount || a.srid.localeCompare(b.srid))
    .slice(0, 50);

  // --- 5. Example SRIDs per finance row count bucket ---
  /** @type {Record<string, string[]>} */
  const examplesByBucket = { "1": [], "2": [], "3": [], "4": [], "5+": [] };

  for (const rec of records) {
    const count = rec.finance?.length ?? 0;
    if (count === 0) continue;
    const bucket = exampleBucketKey(count);
    if (examplesByBucket[bucket].length < 20) {
      examplesByBucket[bucket].push(rec.srid);
    }
  }

  const exampleSridsByFinanceRowCount = Object.fromEntries(
    Object.entries(examplesByBucket).map(([bucket, srids]) => [bucket, srids]),
  );

  const totalFinanceRows =
    records.reduce((n, rec) => n + (rec.finance?.length ?? 0), 0) + financeWithoutSrid.length;

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFile: inputPath,
      sourceMetadata: source.metadata ?? null,
      datasetSummary: {
        uniqueSridRecords: records.length,
        totalFinanceRows,
        financeRowsWithoutSrid: financeWithoutSrid.length,
        sridRecordsWithZeroFinanceRows: financeRowsPerSrid.get(0) ?? 0,
      },
      note: "Statistical summaries only. No profit calculations. No business logic. Attachment flags are at SRID record level (order/sale present on the joined record).",
    },
    financeRowsPerSridDistribution,
    supplierOperNameCounts,
    supplierOperNameStats,
    top50SridsByFinanceEvents,
    exampleSridsByFinanceRowCount,
  };

  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const md = buildMarkdown(report);
  await writeFile(mdPath, md, "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`  SRID records: ${records.length}`);
  console.log(`  Total finance rows: ${totalFinanceRows}`);
  console.log(`  Operation types: ${supplierOperNameStats.length}`);
}

function buildMarkdown(report) {
  const lines = [];
  const ds = report.metadata.datasetSummary;

  lines.push("# Accounting Investigation Report");
  lines.push("");
  lines.push(`Generated: ${report.metadata.generatedAt}`);
  lines.push(`Source: \`${report.metadata.sourceFile}\``);
  lines.push("");
  lines.push("## Dataset summary");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Unique SRID records | ${ds.uniqueSridRecords} |`);
  lines.push(`| Total finance rows | ${ds.totalFinanceRows} |`);
  lines.push(`| Finance rows without SRID | ${ds.financeRowsWithoutSrid} |`);
  lines.push(`| SRID records with 0 finance rows | ${ds.sridRecordsWithZeroFinanceRows} |`);
  lines.push("");
  lines.push("> Statistical summaries only. No profit calculations. Attachment = order/sale present on the SRID record.");
  lines.push("");

  lines.push("## 1. Distribution of finance rows per SRID");
  lines.push("");
  for (const { financeRowCount, sridCount } of report.financeRowsPerSridDistribution) {
    const label =
      financeRowCount === 1
        ? "1 finance row"
        : `${financeRowCount} finance rows`;
    lines.push(`- **${label}**: ${sridCount} SRIDs`);
  }
  lines.push("");

  lines.push("## 2. Distribution of finance `supplier_oper_name`");
  lines.push("");
  lines.push("| Operation type | Row count |");
  lines.push("| --- | ---: |");
  for (const { supplierOperName, count } of report.supplierOperNameCounts) {
    lines.push(`| ${escapeMd(supplierOperName)} | ${count} |`);
  }
  lines.push("");

  lines.push("## 3. Operation type attachment breakdown");
  lines.push("");
  lines.push("| Operation type | Total rows | With sale | With order | Finance-only |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const row of report.supplierOperNameStats) {
    lines.push(
      `| ${escapeMd(row.supplierOperName)} | ${row.totalRows} | ${row.withSale} | ${row.withOrder} | ${row.financeOnly} |`,
    );
  }
  lines.push("");

  lines.push("## 4. Top 50 SRIDs by finance event count");
  lines.push("");
  lines.push("| Rank | SRID | Finance events | Has order | Has sale |");
  lines.push("| ---: | --- | ---: | --- | --- |");
  report.top50SridsByFinanceEvents.forEach((row, i) => {
    lines.push(
      `| ${i + 1} | \`${row.srid}\` | ${row.financeEventCount} | ${row.hasOrder ? "yes" : "no"} | ${row.hasSale ? "yes" : "no"} |`,
    );
  });
  lines.push("");

  lines.push("## 5. Example SRIDs by finance row count");
  lines.push("");
  for (const bucket of ["1", "2", "3", "4", "5+"]) {
    const srids = report.exampleSridsByFinanceRowCount[bucket] ?? [];
    const label = bucket === "5+" ? "5+ rows" : `${bucket} row${bucket === "1" ? "" : "s"}`;
    lines.push(`### ${label} (${srids.length} examples)`);
    lines.push("");
    if (srids.length === 0) {
      lines.push("_No SRIDs in this bucket._");
    } else {
      for (const srid of srids) {
        lines.push(`- \`${srid}\``);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function escapeMd(text) {
  return String(text).replace(/\|/g, "\\|");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
