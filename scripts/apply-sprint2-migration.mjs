#!/usr/bin/env node
/**
 * Apply Sprint 2 migration and verify product_variants + wb_stock exist.
 *
 * CREDENTIAL MODEL (audit):
 * - VERIFY schema  → uses existing project creds (SUPABASE_SERVICE_ROLE_KEY + URL)
 * - APPLY migration → cannot use service role; needs one of:
 *     A) Supabase SQL Editor (manual, no extra env vars)
 *     B) Supabase Management API (SUPABASE_ACCESS_TOKEN or `supabase login`)
 *     C) Direct PostgreSQL (SUPABASE_DB_PASSWORD or SUPABASE_DB_URL)
 *
 * Why not service role?
 * The service role key authenticates to PostgREST (/rest/v1/) — a row-level API over
 * existing tables. It can INSERT/UPDATE/SELECT but cannot run DDL (CREATE TABLE,
 * ALTER TABLE, GRANT, CREATE POLICY). DDL requires the PostgreSQL protocol or Supabase's
 * account-level Management API, which uses a different token than the project API keys.
 *
 * Usage: npx tsx scripts/apply-sprint2-migration.mjs [--audit-only]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

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

const TABLES = ["product_variants", "wb_stock"];

function printAudit() {
  console.log(`Migration credential audit
────────────────────────────────────────────────────────────
Already in .env.local (used by this script):
  NEXT_PUBLIC_SUPABASE_URL     → project endpoint
  SUPABASE_SERVICE_ROLE_KEY  → schema verification only (PostgREST OpenAPI)

Cannot apply DDL with service role because:
  • PostgREST exposes CRUD on existing tables, not schema changes
  • CREATE/ALTER TABLE, GRANT, and CREATE POLICY are PostgreSQL DDL
  • Service role bypasses RLS but still goes through PostgREST, not psql

Apply paths (pick one):
  A) SQL Editor — paste supabase/migrations/20260625120000_product_variants_stock.sql
  B) Management API — SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens)
                       or run \`supabase login\` (token stored in ~/.config/supabase/)
  C) PostgreSQL     — SUPABASE_DB_PASSWORD or SUPABASE_DB_URL
                       (Dashboard → Project Settings → Database → Database password)
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
  const definitions = spec.definitions ?? {};
  const report = {};

  for (const table of TABLES) {
    const props = definitions[table]?.properties ?? null;
    report[table] = props ? Object.keys(props).sort() : null;
  }

  for (const table of ["wb_orders", "wb_sales"]) {
    const props = definitions[table]?.properties ?? {};
    report[`${table}_tech_size`] = "tech_size" in props;
    report[`${table}_barcode`] = "barcode" in props;
  }

  return report;
}

/** Demonstrates service role cannot execute DDL (PostgREST has no SQL endpoint). */
async function confirmServiceRoleCannotApplyDdl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: "SELECT 1" }),
  });

  if (res.status === 404) {
    console.log(
      "Service role check: no exec_sql RPC on PostgREST (expected) — DDL must use SQL Editor, Management API, or PostgreSQL.\n"
    );
  }
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
    await confirmServiceRoleCannotApplyDdl();
    return;
  }

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260625120000_product_variants_stock.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  console.log("=== Sprint 2 migration ===\n");
  console.log("Verify: using SUPABASE_SERVICE_ROLE_KEY (PostgREST OpenAPI)\n");

  const before = await checkOpenApi();
  console.log("Before:", JSON.stringify(before, null, 2));

  const missingBefore = TABLES.filter((t) => !before[t]);
  if (missingBefore.length) {
    console.log(`\nMissing tables: ${missingBefore.join(", ")}`);
    const applyResult = await applyMigration(sql);
    if (!applyResult.applied) {
      printAudit();
      await confirmServiceRoleCannotApplyDdl();
      console.log(`Manual apply: ${migrationPath}\n`);
      process.exitCode = 1;
      return;
    }
    console.log(`\nMigration applied via ${applyResult.via}.`);
  } else {
    console.log("\nTables already present — skipping DDL apply.");
  }

  const after = await checkOpenApi();
  console.log("\nAfter:", JSON.stringify(after, null, 2));

  const ok =
    after.product_variants?.includes("nm_id") &&
    after.wb_stock?.includes("warehouse") &&
    after.wb_orders_tech_size &&
    after.wb_orders_barcode &&
    after.wb_sales_tech_size &&
    after.wb_sales_barcode;

  console.log(ok ? "\nPASS  Schema ready for Sprint 2 sync." : "\nFAIL  Schema incomplete.");
  if (!ok) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
