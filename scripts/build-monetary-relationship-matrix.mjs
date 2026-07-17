#!/usr/bin/env node
/**
 * Temporary — monetary relationship matrix for Продажа rows in finance.json.
 * No application code changes. No business logic. Proven equations only.
 *
 * Usage:
 *   node scripts/build-monetary-relationship-matrix.mjs [financePath] [outputBase]
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";

const DEFAULT_FINANCE = "exports/wb-raw-2026-06-18_2026-06-29/finance.json";
const DEFAULT_OUTPUT_BASE = "exports/monetary-relationship-matrix";
const OPERATION = "Продажа";
const TOLERANCE = 0.01;

const FIELDS = [
  "retail_price",
  "retail_amount",
  "retail_price_withdisc_rub",
  "ppvz_sales_commission",
  "ppvz_reward",
  "ppvz_vw",
  "ppvz_vw_nds",
  "acquiring_fee",
  "ppvz_for_pay",
];

function closeEnough(a, b) {
  return Math.abs(a - b) <= TOLERANCE;
}

function permutations3(fields) {
  const out = [];
  for (const a of fields) {
    for (const b of fields) {
      if (b === a) continue;
      for (const c of fields) {
        if (c === a || c === b) continue;
        out.push([a, b, c]);
      }
    }
  }
  return out;
}

function permutations4(fields) {
  const out = [];
  for (const a of fields) {
    for (const b of fields) {
      if (b === a) continue;
      for (const c of fields) {
        if (c === a || c === b) continue;
        for (const d of fields) {
          if (d === a || d === b || d === c) continue;
          out.push([a, b, c, d]);
        }
      }
    }
  }
  return out;
}

function detectRelationships(rows) {
  const proven = [];

  for (const [a, b, c] of permutations3(FIELDS)) {
    const eqPlus = rows.every((r) => closeEnough(r[a], r[b] + r[c]));
    if (eqPlus) {
      proven.push({ equation: `${a} = ${b} + ${c}`, pattern: "A = B + C", matchRate: 1 });
    }

    const eqMinus = rows.every((r) => closeEnough(r[a], r[b] - r[c]));
    if (eqMinus) {
      proven.push({ equation: `${a} = ${b} - ${c}`, pattern: "A = B - C", matchRate: 1 });
    }
  }

  for (const [a, b, c, d] of permutations4(FIELDS)) {
    const eqPlus = rows.every((r) => closeEnough(r[a], r[b] + r[c] + r[d]));
    if (eqPlus) {
      proven.push({
        equation: `${a} = ${b} + ${c} + ${d}`,
        pattern: "A = B + C + D",
        matchRate: 1,
      });
    }

    const eqMinus = rows.every((r) => closeEnough(r[a], r[b] - r[c] - r[d]));
    if (eqMinus) {
      proven.push({
        equation: `${a} = ${b} - ${c} - ${d}`,
        pattern: "A = B - C - D",
        matchRate: 1,
      });
    }
  }

  proven.sort((x, y) => x.equation.localeCompare(y.equation));
  return proven;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push("# Monetary Relationship Matrix — Продажа");
  lines.push("");
  lines.push(`Generated: ${report.metadata.generatedAt}`);
  lines.push(`Source: \`${report.metadata.sourceFile}\``);
  lines.push(`Operation: ${OPERATION}`);
  lines.push(`Rows: ${report.metadata.rowCount}`);
  lines.push(`Tolerance: ±${TOLERANCE} RUB`);
  lines.push("");

  lines.push("## Row values (sorted by SRID)");
  lines.push("");
  lines.push(
    `| SRID | ${FIELDS.join(" | ")} |`,
  );
  lines.push(`| --- | ${FIELDS.map(() => "---:").join(" | ")} |`);

  for (const row of report.rows) {
    const vals = FIELDS.map((f) => row[f]).join(" | ");
    lines.push(`| \`${row.srid}\` | ${vals} |`);
  }
  lines.push("");

  lines.push("## Proven equations (100% of rows, ±0.01 RUB)");
  lines.push("");
  if (report.provenEquations.length === 0) {
    lines.push("_None found._");
  } else {
    for (const eq of report.provenEquations) {
      lines.push(`- \`${eq.equation}\` (${eq.pattern})`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const cwd = process.cwd();
  const financePath = resolve(cwd, process.argv[2] ?? DEFAULT_FINANCE);
  const outputBase = resolve(cwd, process.argv[3] ?? DEFAULT_OUTPUT_BASE);
  const jsonPath = `${outputBase}.json`;
  const mdPath = `${outputBase}.md`;

  const source = JSON.parse(await readFile(financePath, "utf8"));
  const saleRows = (source.data ?? [])
    .filter((r) => r.supplier_oper_name === OPERATION)
    .sort((a, b) => String(a.srid ?? "").localeCompare(String(b.srid ?? "")));

  const tableRows = saleRows.map((r) => {
    const out = { srid: r.srid ?? null };
    for (const f of FIELDS) out[f] = r[f];
    return out;
  });

  const provenEquations = detectRelationships(saleRows);

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceFile: financePath,
      operation: OPERATION,
      rowCount: saleRows.length,
      toleranceRub: TOLERANCE,
      fields: FIELDS,
    },
    rows: tableRows,
    provenEquations,
  };

  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await writeFile(mdPath, buildMarkdown(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`  Продажа rows: ${saleRows.length}`);
  console.log(`  proven equations: ${provenEquations.length}`);
  for (const eq of provenEquations) {
    console.log(`    ${eq.equation}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
