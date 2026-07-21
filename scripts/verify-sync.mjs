#!/usr/bin/env node
/**
 * Post-migration verification:
 * 1. Checks live Supabase columns match sync service expectations
 * 2. Runs POST /api/sync
 * 3. Reports insert/update counts per entity
 *
 * Usage: node scripts/verify-sync.mjs
 */

import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    process.env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
}

const EXPECTED = {
  brands: ["id", "name", "created_at"],
  categories: ["id", "name", "parent_id", "created_at"],
  products: ["id", "supplier_article", "nm_id", "name", "brand_id", "category_id", "barcode", "created_at"],
  wb_orders: ["id", "srid", "nm_id", "product_id", "order_date", "sale_date", "price", "quantity", "status", "warehouse"],
  wb_sales: ["id", "srid", "nm_id", "product_id", "sale_date", "revenue", "quantity", "is_return", "return_date", "warehouse"],
  wb_finance: ["id", "product_id", "nm_id", "operation_date", "operation_type", "amount", "source_key", "description", "srid"],
};

function fmtError(e) {
  if (!e) return null;
  return `${e.code ?? "?"}: ${e.message}${e.hint ? ` (hint: ${e.hint})` : ""}`;
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const base = process.env.VERIFY_SYNC_URL ?? "http://localhost:3000";

async function checkSchema() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  let ok = true;

  console.log("\n=== SCHEMA CHECK ===");
  for (const [table, cols] of Object.entries(EXPECTED)) {
    const live = Object.keys(spec.definitions?.[table]?.properties ?? {}).sort();
    const missing = cols.filter((c) => !live.includes(c));
    const extra = live.filter((c) => !cols.includes(c) && c !== "created_at");
    if (missing.length) {
      ok = false;
      console.log(`FAIL ${table}: missing [${missing.join(", ")}]`);
    } else {
      console.log(`OK   ${table}${extra.length ? ` (extra: ${extra.join(", ")})` : ""}`);
    }
  }
  return ok;
}

async function checkPermissions() {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let ok = true;

  console.log("\n=== PERMISSION CHECK ===");
  for (const table of Object.keys(EXPECTED)) {
    const { error } = await sb.from(table).select("id").limit(1);
    const msg = fmtError(error);
    if (msg?.includes("42501")) {
      ok = false;
      console.log(`FAIL ${table}: ${msg}`);
    } else if (msg) {
      console.log(`WARN ${table}: ${msg}`);
    } else {
      console.log(`OK   ${table}: SELECT granted`);
    }
  }
  return ok;
}

async function runSync() {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  console.log("\n=== SYNC TEST ===");
  console.log(`POST ${base}/api/sync (${from} → ${to})`);

  const res = await fetch(`${base}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dateFrom: from,
      dateTo: to,
      entities: ["products", "orders", "sales", "finance"],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.log("FAIL sync HTTP", res.status, data.error ?? data);
    return false;
  }

  let ok = true;
  for (const r of data.results ?? []) {
    const hasErrors = r.errors?.length > 0;
    const inserted = r.recordsInserted ?? 0;
    const updated = r.recordsUpdated ?? 0;
    const status = hasErrors && inserted === 0 && updated === 0 ? "FAIL" : "OK";
    if (status === "FAIL") ok = false;

    console.log(
      `${status} ${r.entity}: processed=${r.recordsProcessed} inserted=${inserted} updated=${updated} errors=${r.errors?.length ?? 0}`
    );
    if (hasErrors) {
      for (const e of r.errors.slice(0, 5)) console.log(`     ${e}`);
      if (r.errors.length > 5) console.log(`     ... +${r.errors.length - 5} more`);
    }
  }
  return ok;
}

async function main() {
  console.log("OrionShop post-migration sync verification\n");

  const schemaOk = await checkSchema();
  const permOk = await checkPermissions();

  if (!schemaOk || !permOk) {
    console.log("\n❌ Schema or permissions not ready. Apply migrations first.");
    process.exit(1);
  }

  const syncOk = await runSync();
  console.log(syncOk ? "\n✅ Sync verification passed" : "\n❌ Sync verification failed");
  process.exit(syncOk ? 0 : 1);
}

main().catch((e) => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
