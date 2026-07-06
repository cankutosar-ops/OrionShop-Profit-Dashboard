#!/usr/bin/env node
/**
 * Sprint 4 Phase 2 — apply wb_stock inventory columns migration.
 *
 * Verify: PostgREST OpenAPI (SUPABASE_SERVICE_ROLE_KEY)
 * Apply:  Management API (SUPABASE_ACCESS_TOKEN) or PostgreSQL (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD)
 *
 * Usage: npx tsx scripts/apply-inventory-phase2-migration.mjs [--audit-only]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const REQUIRED_COLUMNS = [
  "quantity",
  "quantity_full",
  "in_way_to_client",
  "in_way_from_client",
  "last_synced_at",
];

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const idx = trimmed.indexOf("=");
        if (idx === -1) continue;
        process.env[trimmed.slice(0, idx).trim()] ??= trimmed.slice(idx + 1).trim();
      }
    } catch {
      // optional
    }
  }
}

function printAudit() {
  console.log(`Phase 2 migration credential audit
────────────────────────────────────────────────────────────
Verify schema: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

Apply DDL (pick one):
  A) SQL Editor — paste supabase/migrations/20260627120000_wb_stock_inventory_fields.sql
  B) Management API — SUPABASE_ACCESS_TOKEN or \`supabase login\`
  C) PostgreSQL — SUPABASE_DB_URL or SUPABASE_DB_PASSWORD
────────────────────────────────────────────────────────────
`);
}

async function checkOpenApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  const props = spec.definitions?.wb_stock?.properties ?? {};
  const columns = Object.keys(props).sort();
  const missing = REQUIRED_COLUMNS.filter((col) => !(col in props));
  return { columns, missing, hasSyncedAt: "synced_at" in props };
}

function resolveAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return readFileSync(resolve(process.env.HOME ?? "", ".config/supabase/access-token"), "utf8").trim();
  } catch {
    return null;
  }
}

async function applyViaManagementApi(sql) {
  const token = resolveAccessToken();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url) return { applied: false, reason: "no_access_token" };

  const ref = new URL(url).hostname.split(".")[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { applied: false, reason: `management_api_${res.status}: ${body.slice(0, 200)}` };
  }
  return { applied: true };
}

function buildDbUrlFromPassword() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!password || !url) return null;
  const ref = new URL(url).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function applyViaPg(sql) {
  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? buildDbUrlFromPassword();
  if (!dbUrl) return { applied: false, reason: "no_db_url" };

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    return { applied: true };
  } finally {
    await client.end();
  }
}

async function applyMigration(sql) {
  const attempts = [
    ["management_api", () => applyViaManagementApi(sql)],
    ["postgres", () => applyViaPg(sql)],
  ];
  for (const [via, fn] of attempts) {
    try {
      const result = await fn();
      if (result.applied) return { applied: true, via };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${via} failed:`, message);
    }
  }
  return { applied: false };
}

async function main() {
  loadEnv();

  if (process.argv.includes("--audit-only")) {
    printAudit();
    return;
  }

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260627120000_wb_stock_inventory_fields.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  console.log("=== Sprint 4 Phase 2 — wb_stock migration ===\n");

  const before = await checkOpenApi();
  console.log("Before wb_stock columns:", before.columns.join(", ") || "(table missing)");
  if (before.hasSyncedAt) console.log("Note: legacy synced_at present — migration will rename to last_synced_at");

  if (before.missing.length) {
    console.log(`\nMissing columns: ${before.missing.join(", ")}`);
    const applyResult = await applyMigration(sql);
    if (!applyResult.applied) {
      printAudit();
      console.log(`Manual apply: ${migrationPath}\n`);
      process.exit(1);
    }
    console.log(`\nMigration applied via ${applyResult.via}.`);
  } else {
    console.log("\nAll required columns present — skipping DDL apply.");
  }

  const after = await checkOpenApi();
  const stillMissing = REQUIRED_COLUMNS.filter((col) => !after.columns.includes(col));
  if (stillMissing.length) {
    console.log("\nFAIL — still missing:", stillMissing.join(", "));
    process.exit(1);
  }

  console.log("\nPASS — wb_stock schema ready for full stock sync.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
