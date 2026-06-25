#!/usr/bin/env node
/**
 * Apply srid migration, re-sync finance, verify logistics v2 totals.
 * Usage: node scripts/logistics-v2-verify.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.env.AUDIT_FROM || "2026-05-24";
const to = process.env.AUDIT_TO || "2026-06-23";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchAll(client, table, col) {
  const rows = [];
  let offset = 0;
  while (true) {
    let q = client.from(table).select("*");
    if (col) q = q.gte(col, from).lte(col, to);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

function buildPurchaseSridSet(sales) {
  const srids = new Set();
  for (const sale of sales) {
    if (sale.is_return || !sale.srid) continue;
    srids.add(sale.srid);
  }
  return srids;
}

function sumLogisticsAll(finance, productId) {
  return finance
    .filter((f) => String(f.product_id) === String(productId) && f.operation_type === "logistics")
    .reduce((s, r) => s + Number(r.amount), 0);
}

function sumLogisticsV2(finance, productId, purchaseSrids) {
  let purchase = 0;
  let excluded = 0;
  let purchaseRows = 0;
  let excludedRows = 0;
  for (const row of finance) {
    if (String(row.product_id) !== String(productId) || row.operation_type !== "logistics") continue;
    if (row.srid && purchaseSrids.has(row.srid)) {
      purchase += Number(row.amount);
      purchaseRows += 1;
    } else {
      excluded += Number(row.amount);
      excludedRows += 1;
    }
  }
  return { purchase, excluded, purchaseRows, excludedRows };
}

async function applyMigrationViaPg() {
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) return { applied: false, reason: "No DATABASE_URL in .env.local" };
  try {
    const pg = await import("pg");
    const client = new pg.default.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260624120000_wb_finance_srid.sql"),
      "utf8"
    );
    await client.query(sql);
    await client.end();
    return { applied: true };
  } catch (err) {
    return { applied: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function runFinanceSync() {
  const base = process.env.VERIFY_SYNC_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dateFrom: from, dateTo: to, entities: ["finance"] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Sync HTTP ${res.status}`);
  return data;
}

async function main() {
  console.log("=== Logistics V2 deploy & verify ===\n");

  const migration = await applyMigrationViaPg();
  console.log("Migration:", migration.applied ? "applied" : `skipped (${migration.reason})`);

  if (process.env.RUN_FINANCE_SYNC === "1") {
    try {
      const sync = await runFinanceSync();
      console.log("Finance sync:", JSON.stringify(sync.results?.[0] ?? sync, null, 2));
    } catch (err) {
      console.log("Finance sync skipped:", err instanceof Error ? err.message : err);
    }
  } else {
    console.log("Finance sync: skipped (set RUN_FINANCE_SYNC=1 and start dev server, or sync manually)");
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [products, sales, finance] = await Promise.all([
    fetchAll(client, "products"),
    fetchAll(client, "wb_sales", "sale_date"),
    fetchAll(client, "wb_finance", "operation_date"),
  ]);

  const hasSridColumn = finance.length > 0 && Object.prototype.hasOwnProperty.call(finance[0], "srid");
  const logistics = finance.filter((f) => f.operation_type === "logistics");
  const withSrid = finance.filter((f) => f.srid);
  const logWithSrid = logistics.filter((f) => f.srid);

  console.log("\n--- SRID data ---");
  console.log({
    sridColumnExists: hasSridColumn,
    totalFinanceRows: finance.length,
    financeRowsWithSrid: withSrid.length,
    logisticsRows: logistics.length,
    logisticsWithSrid: logWithSrid.length,
    logisticsNullSrid: logistics.length - logWithSrid.length,
  });

  const ranked = products
    .map((product) => {
      const pid = product.id;
      const productSales = sales.filter((s) => String(s.product_id) === String(pid));
      const purchases = productSales.filter((s) => !s.is_return);
      const revenue = purchases.reduce((s, x) => s + Number(x.revenue), 0);
      if (revenue <= 0) return null;
      const purchaseSrids = buildPurchaseSridSet(productSales);
      const before = sumLogisticsAll(finance, pid);
      const after = sumLogisticsV2(finance, pid, purchaseSrids);
      const returnLog = finance
        .filter((f) => String(f.product_id) === String(pid) && f.operation_type === "return_logistics")
        .reduce((s, r) => s + Number(r.amount), 0);
      return {
        article: product.supplier_article,
        revenue,
        qty: purchases.reduce((s, x) => s + Number(x.quantity ?? 1), 0),
        beforeLogistics: before,
        afterPurchaseLogistics: after.purchase,
        excludedLogistics: after.excluded,
        returnLogistics: returnLog,
        purchaseRows: after.purchaseRows,
        excludedRows: after.excludedRows,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.revenue - a.revenue);

  const top5 = ranked.slice(0, 5);
  const totals = ranked.reduce(
    (acc, p) => {
      acc.revenue += p.revenue;
      acc.beforeLogistics += p.beforeLogistics;
      acc.purchaseLogistics += p.afterPurchaseLogistics;
      acc.excludedLogistics += p.excludedLogistics;
      acc.returnLogistics += p.returnLogistics;
      acc.purchaseRows += p.purchaseRows;
      acc.excludedRows += p.excludedRows;
      return acc;
    },
    {
      revenue: 0,
      beforeLogistics: 0,
      purchaseLogistics: 0,
      excludedLogistics: 0,
      returnLogistics: 0,
      purchaseRows: 0,
      excludedRows: 0,
    }
  );

  console.log("\n--- Before vs After (all products with revenue) ---");
  console.log(JSON.stringify(totals, null, 2));

  console.log("\n--- Top 5 impact ---");
  for (const p of top5) {
    console.log(
      `${p.article}: before ${Math.round(p.beforeLogistics)} → purchase ${Math.round(p.afterPurchaseLogistics)} | excluded ${Math.round(p.excludedLogistics)} | return ${Math.round(p.returnLogistics)}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
