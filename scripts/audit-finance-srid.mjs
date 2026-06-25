#!/usr/bin/env node
/**
 * Audit WB reportDetailByPeriod srid population vs mapper output.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.env.AUDIT_FROM || "2026-05-24";
const to = process.env.AUDIT_TO || "2026-06-23";

const { WbApiClient } = await import("../src/lib/wildberries/api-client.ts");
const { mapFinanceRowsFromReport } = await import("../src/lib/wildberries/mappers.ts");

const client = new WbApiClient();
const rows = await client.fetchFinanceReport(from, to);

const logisticsRows = rows.filter(
  (r) => Math.abs(Number(r.delivery_rub ?? 0)) > 0 || (r.supplier_oper_name ?? "").toLowerCase().includes("логист")
);

const withSrid = rows.filter((r) => r.srid);
const withRid = rows.filter((r) => r.rid != null && r.rid !== "");
const logisticsWithSrid = logisticsRows.filter((r) => r.srid);
const logisticsWithRid = logisticsRows.filter((r) => r.rid != null && r.rid !== "");
const logisticsWithEither = logisticsRows.filter((r) => r.srid || (r.rid != null && r.rid !== ""));

console.log("=== WB raw reportDetailByPeriod ===");
console.log({
  totalRows: rows.length,
  rowsWithSrid: withSrid.length,
  rowsWithRid: withRid.length,
  logisticsCandidateRows: logisticsRows.length,
  logisticsWithSrid: logisticsWithSrid.length,
  logisticsWithRid: logisticsWithRid.length,
  logisticsWithSridOrRid: logisticsWithEither.length,
});

// Sample keys on first logistics row
const sample = logisticsRows.find((r) => r.delivery_rub) ?? logisticsRows[0] ?? rows[0];
if (sample) {
  console.log("\n=== Sample raw row keys (logistics-related) ===");
  const keys = Object.keys(sample).sort();
  const idKeys = keys.filter((k) => /srid|rid|gi_|shk|order|sale|assembly/i.test(k));
  console.log("id-like keys:", idKeys.join(", "));
  console.log("\n=== Sample raw values ===");
  for (const k of idKeys) {
    console.log(`  ${k}:`, sample[k]);
  }
  console.log("  delivery_rub:", sample.delivery_rub);
  console.log("  supplier_oper_name:", sample.supplier_oper_name);
  console.log("  rrd_id:", sample.rrd_id);

  const mapped = mapFinanceRowsFromReport(sample, null);
  const logLine = mapped.find((l) => l.operation_type === "logistics");
  console.log("\n=== Mapper output (logistics line) ===");
  console.log(JSON.stringify(logLine, null, 2));
}

// Compare 5 logistics rows: raw srid/rid vs mapped srid
console.log("\n=== First 5 logistics rows: raw → mapped srid ===");
for (const row of logisticsRows.slice(0, 5)) {
  const mapped = mapFinanceRowsFromReport(row, null).find((l) => l.operation_type === "logistics");
  console.log({
    rrd_id: row.rrd_id,
    raw_srid: row.srid ?? null,
    raw_rid: row.rid ?? null,
    mapped_srid: mapped?.srid ?? null,
    delivery_rub: row.delivery_rub,
    oper: row.supplier_oper_name,
  });
}

// DB stats
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

let offset = 0;
let total = 0;
let withDbSrid = 0;
let logistics = 0;
let logWithSrid = 0;
while (true) {
  const { data, error } = await supabase
    .from("wb_finance")
    .select("operation_type, srid")
    .gte("operation_date", from)
    .lte("operation_date", to)
    .range(offset, offset + 999);
  if (error) {
    console.error("DB error:", error.message);
    break;
  }
  for (const r of data ?? []) {
    total++;
    if (r.srid) withDbSrid++;
    if (r.operation_type === "logistics") {
      logistics++;
      if (r.srid) logWithSrid++;
    }
  }
  if ((data?.length ?? 0) < 1000) break;
  offset += 1000;
}

console.log("\n=== DB wb_finance (current) ===");
console.log({ total, withDbSrid, logistics, logWithSrid });
