#!/usr/bin/env node
/**
 * Temporary — join raw WB exports into one SRID-keyed reconciliation dataset.
 * Does NOT modify application code or data.
 *
 * Usage:
 *   node scripts/build-accounting-reconciliation.mjs [exportDir] [outputPath]
 *
 * Default:
 *   exportDir  = exports/wb-raw-2026-06-18_2026-06-29
 *   outputPath = exports/accounting-reconciliation.json
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { resolve, dirname } from "path";

const DEFAULT_EXPORT_DIR = "exports/wb-raw-2026-06-18_2026-06-29";
const DEFAULT_OUTPUT = "exports/accounting-reconciliation.json";

function sridKey(row) {
  const v = row?.srid;
  if (v === undefined || v === null || v === "") return null;
  return String(v);
}

async function loadExport(exportDir, name) {
  const filePath = resolve(exportDir, `${name}.json`);
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed.data)) {
    return { path: filePath, metadata: parsed.metadata ?? null, rows: parsed.data };
  }
  if (parsed.data == null && parsed.metadata?.error) {
    return { path: filePath, metadata: parsed.metadata ?? null, rows: [] };
  }
  throw new Error(`${filePath}: expected { data: [...] }`);
}

function pickSingleOrNull(items) {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  return items;
}

async function main() {
  const cwd = process.cwd();
  const exportDir = resolve(cwd, process.argv[2] ?? DEFAULT_EXPORT_DIR);
  const outputPath = resolve(cwd, process.argv[3] ?? DEFAULT_OUTPUT);

  const [ordersExport, salesExport, financeExport] = await Promise.all([
    loadExport(exportDir, "orders"),
    loadExport(exportDir, "sales"),
    loadExport(exportDir, "finance"),
  ]);

  /** @type {Map<string, { orders: object[], sales: object[], finance: object[] }>} */
  const bySrid = new Map();

  /** @type {object[]} */
  const financeWithoutSrid = [];

  function bucket(key) {
    if (!bySrid.has(key)) {
      bySrid.set(key, { orders: [], sales: [], finance: [] });
    }
    return bySrid.get(key);
  }

  for (const row of ordersExport.rows) {
    const key = sridKey(row);
    if (key === null) continue;
    bucket(key).orders.push(row);
  }

  for (const row of salesExport.rows) {
    const key = sridKey(row);
    if (key === null) continue;
    bucket(key).sales.push(row);
  }

  for (const row of financeExport.rows) {
    const key = sridKey(row);
    if (key === null) {
      financeWithoutSrid.push(row);
      continue;
    }
    bucket(key).finance.push(row);
  }

  const srids = [...bySrid.keys()].sort();

  const records = srids.map((srid) => {
    const { orders, sales, finance } = bySrid.get(srid);
    return {
      srid,
      order: pickSingleOrNull(orders),
      sale: pickSingleOrNull(sales),
      finance,
    };
  });

  const output = {
    metadata: {
      builtAt: new Date().toISOString(),
      sources: {
        orders: { path: ordersExport.path, rowCount: ordersExport.rows.length, metadata: ordersExport.metadata },
        sales: { path: salesExport.path, rowCount: salesExport.rows.length, metadata: salesExport.metadata },
        finance: { path: financeExport.path, rowCount: financeExport.rows.length, metadata: financeExport.metadata },
      },
      uniqueSridCount: records.length,
      financeRowsWithoutSrid: financeWithoutSrid.length,
      note: "One record per unique SRID. Raw fields preserved. finance is always an array; order/sale are null, a single object, or an array when multiple source rows share the same SRID.",
    },
    data: records,
    financeWithoutSrid,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log(`Wrote ${outputPath}`);
  console.log(`  unique SRIDs: ${records.length}`);
  console.log(`  finance rows without SRID: ${financeWithoutSrid.length}`);
  console.log(
    `  finance-only SRIDs (no order/sale): ${records.filter((r) => r.order == null && r.sale == null && r.finance.length > 0).length}`,
  );
  console.log(
    `  SRIDs with multiple finance rows: ${records.filter((r) => r.finance.length > 1).length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
