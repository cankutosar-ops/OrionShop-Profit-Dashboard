#!/usr/bin/env node
/**
 * Read-only wb_sales event integrity report.
 *
 *   npx tsx scripts/verify-sales-warehouse-integrity.mjs [accountId] [from] [to]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[t.slice(0, i).trim()] ??= v;
    }
  }
}
loadEnv();

const accountId = process.argv[2] ?? "2";
const from = process.argv[3] ?? "2026-07-27";
const to = process.argv[4] ?? "2026-09-06";

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const sb = createAdminClient();

async function fetchAll(select, apply) {
  const PAGE = 1000;
  const rows = [];
  let offset = 0;
  for (;;) {
    let q = sb.from("wb_sales").select(select).range(offset, offset + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

const probe = await sb.from("wb_sales").select("sale_id, event_type").limit(1);
if (probe.error) {
  console.log(
    JSON.stringify(
      {
        saleIdColumn: "MISSING",
        message:
          "Apply supabase/migrations/20260911100000_wb_sales_event_identity.sql before integrity checks.",
        error: probe.error.message,
      },
      null,
      2
    )
  );
  process.exit(2);
}

const rows = await fetchAll(
  "id, sale_id, event_type, srid, is_return, sale_date, return_date, product_id, price_with_disc, revenue, quantity",
  (q) =>
    q
      .eq("marketplace_account_id", accountId)
      .gte("sale_date", from)
      .lte("sale_date", to)
);

const saleIds = new Map();
const bySrid = new Map();
let missingProduct = 0;
let saleDateOverwrittenByReturnDate = 0;
let unresolved = 0;

for (const row of rows) {
  const saleId = String(row.sale_id ?? "");
  saleIds.set(saleId, (saleIds.get(saleId) ?? 0) + 1);
  if (saleId.startsWith("unresolved:")) unresolved += 1;
  if (!row.product_id) missingProduct += 1;
  if (!row.is_return && row.return_date && String(row.return_date).slice(0, 10) !== String(row.sale_date).slice(0, 10)) {
    saleDateOverwrittenByReturnDate += 1;
  }
  const list = bySrid.get(row.srid) ?? [];
  list.push(row);
  bySrid.set(row.srid, list);
}

const duplicateSaleIds = [...saleIds.entries()].filter(([, n]) => n > 1);
const both = [];
const returnOnly = [];
const saleOnly = [];
for (const [srid, list] of bySrid) {
  const hasSale = list.some((r) => !r.is_return);
  const hasReturn = list.some((r) => r.is_return);
  if (hasSale && hasReturn) both.push(srid);
  else if (hasReturn) returnOnly.push(srid);
  else saleOnly.push(srid);
}

const report = {
  accountId,
  from,
  to,
  rows: rows.length,
  saleEvents: rows.filter((r) => !r.is_return).length,
  returnEvents: rows.filter((r) => r.is_return).length,
  uniqueSrids: bySrid.size,
  sridsWithSaleAndReturn: both.length,
  sridsReturnOnly: returnOnly.length,
  sridsSaleOnly: saleOnly.length,
  duplicateEventIdentities: duplicateSaleIds.length,
  unresolvedPlaceholders: unresolved,
  missingProductMappings: missingProduct,
  saleRowsWithDistinctReturnDate: saleDateOverwrittenByReturnDate,
  note:
    "Return-only SRIDs may be legitimate returns whose sale date is outside this window, or overwritten sales not yet re-synced. Placeholders are not reconstructed sale amounts.",
  returnOnlySample: returnOnly.slice(0, 20),
};

console.log(JSON.stringify(report, null, 2));

if (duplicateSaleIds.length > 0) process.exit(1);
