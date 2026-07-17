#!/usr/bin/env node
/**
 * PART 1 — Database environment and schema validation.
 * Queries information_schema.columns when DB credentials are available.
 * Gates the sales persistence sprint — exits non-zero if required columns are missing.
 *
 * Usage: npx tsx scripts/validate-db-environment.mjs [--json]
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_WB_SALES_COLUMNS = ["price_with_disc", "for_pay"];
const REPORT_PATH = resolve("exports/sales-backfill/db-environment-report.json");

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

function resolveAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const home = process.env.USERPROFILE ?? process.env.HOME ?? "";
  try {
    return readFileSync(resolve(home, ".config/supabase/access-token"), "utf8").trim();
  } catch {
    return null;
  }
}

function buildDbUrlFromPassword() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!password || !url) return null;
  const ref = new URL(url).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function queryViaManagementApi(sql) {
  const token = resolveAccessToken();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url) return { ok: false, reason: "no_access_token" };

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
    return { ok: false, reason: `management_api_${res.status}: ${body.slice(0, 300)}` };
  }
  const data = await res.json();
  return { ok: true, rows: data.result ?? data };
}

async function queryViaPg(sql) {
  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? buildDbUrlFromPassword();
  if (!dbUrl) return { ok: false, reason: "no_db_url" };

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const result = await client.query(sql);
    return { ok: true, rows: result.rows };
  } finally {
    await client.end();
  }
}

async function runInformationSchemaQuery(sql) {
  for (const fn of [() => queryViaManagementApi(sql), () => queryViaPg(sql)]) {
    try {
      const result = await fn();
      if (result.ok) return { source: "information_schema", rows: result.rows };
    } catch (err) {
      // try next method
    }
  }
  return null;
}

async function fetchOpenApiColumns(url, key, table) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  const props = spec.definitions?.[table]?.properties ?? {};
  return Object.entries(props)
    .map(([column_name, meta]) => ({
      column_name,
      data_type: meta.format ?? meta.type,
      source: "openapi",
    }))
    .sort((a, b) => a.column_name.localeCompare(b.column_name));
}

async function probeColumn(client, table, column) {
  const { error } = await client.from(table).select(column).limit(1);
  return {
    exists: !error,
    error: error?.message ?? null,
  };
}

function migrationStatus(columns) {
  const missing = REQUIRED_WB_SALES_COLUMNS.filter((c) => !columns[c]?.exists);
  if (missing.length === 0) {
    return { status: "applied", generated: false, missing: [] };
  }
  return {
    status: "generated_not_applied",
    generated: true,
    migrationFile: "supabase/migrations/20260712180000_wb_sales_price_with_disc.sql",
    missing,
  };
}

async function main() {
  loadEnv();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  const projectRef = new URL(url).hostname.split(".")[0];
  const client = createClient(url, key, { auth: { persistSession: false } });

  const infoSchemaSql = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'wb_sales'
    ORDER BY ordinal_position;
  `;

  const versionSql = `SELECT version() AS database_version;`;

  let wbSalesColumns = [];
  let schemaSource = "unavailable";
  let databaseVersion = null;
  let environment = {
    branch: process.env.SUPABASE_BRANCH ?? "production (default)",
    credentials: {
      hasAccessToken: Boolean(resolveAccessToken()),
      hasDbPassword: Boolean(process.env.SUPABASE_DB_PASSWORD),
      hasDatabaseUrl: Boolean(process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL),
    },
  };

  const infoResult = await runInformationSchemaQuery(infoSchemaSql);
  if (infoResult) {
    wbSalesColumns = infoResult.rows;
    schemaSource = infoResult.source;
  } else {
    wbSalesColumns = await fetchOpenApiColumns(url, key, "wb_sales");
    schemaSource = "openapi_fallback";
  }

  const versionResult = await runInformationSchemaQuery(versionSql);
  if (versionResult?.rows?.[0]) {
    databaseVersion = versionResult.rows[0].database_version ?? versionResult.rows[0];
  }

  const columnMap = {};
  for (const row of wbSalesColumns) {
    columnMap[row.column_name] = {
      data_type: row.data_type,
      is_nullable: row.is_nullable,
      column_default: row.column_default,
      source: row.source ?? schemaSource,
    };
  }

  for (const col of REQUIRED_WB_SALES_COLUMNS) {
    const probe = await probeColumn(client, "wb_sales", col);
    columnMap[col] = {
      ...columnMap[col],
      exists: probe.exists,
      probeError: probe.error,
    };
  }

  const required = Object.fromEntries(
    REQUIRED_WB_SALES_COLUMNS.map((c) => [c, columnMap[c]?.exists === true])
  );
  const schemaCorrect = REQUIRED_WB_SALES_COLUMNS.every((c) => required[c]);
  const migration = migrationStatus(
    Object.fromEntries(REQUIRED_WB_SALES_COLUMNS.map((c) => [c, { exists: required[c] }]))
  );

  const report = {
    generatedAt: new Date().toISOString(),
    connected: {
      supabaseProjectId: projectRef,
      supabaseUrl: url,
      database: "postgres",
      environment,
      databaseVersion,
      schemaQuerySource: schemaSource,
    },
    wb_sales: {
      columns: wbSalesColumns,
      columnMap,
      required,
      schemaCorrect,
    },
    migration,
    sprintGate: {
      passed: schemaCorrect,
      message: schemaCorrect
        ? "Schema validated — safe to proceed with backfill and runtime switch."
        : "BLOCKED — apply migration before backfill or runtime changes.",
    },
  };

  mkdirSync(resolve("exports/sales-backfill"), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  const jsonOnly = process.argv.includes("--json");
  if (!jsonOnly) {
    console.log("=== PART 1 — Database Environment Validation ===\n");
    console.log(`Supabase Project ID: ${projectRef}`);
    console.log(`Connected Database: postgres`);
    console.log(`Environment: ${environment.branch}`);
    console.log(`Database version: ${databaseVersion ?? "unknown (needs SUPABASE_DB_PASSWORD or SUPABASE_ACCESS_TOKEN)"}`);
    console.log(`Schema query source: ${schemaSource}`);
    console.log("\n--- wb_sales columns ---");
    for (const row of wbSalesColumns) {
      console.log(`  ${row.column_name}: ${row.data_type ?? "?"}`);
    }
    console.log("\n--- Required columns ---");
    for (const col of REQUIRED_WB_SALES_COLUMNS) {
      const status = required[col] ? "EXISTS" : "MISSING";
      const err = columnMap[col]?.probeError;
      console.log(`  ${col}: ${status}${err ? ` (${err})` : ""}`);
    }
    console.log("\n--- Migration status ---");
    console.log(`  ${migration.status === "applied" ? "Migration Applied" : "Migration Generated, NOT Applied"}`);
    if (migration.migrationFile) console.log(`  File: ${migration.migrationFile}`);
    console.log(`\nReport: ${REPORT_PATH}`);
    console.log(`\nSprint gate: ${report.sprintGate.passed ? "PASS" : "BLOCKED"}`);
    if (!report.sprintGate.passed) {
      console.log("\nSet SUPABASE_DB_PASSWORD or SUPABASE_ACCESS_TOKEN in .env.local, then:");
      console.log("  npm run apply:wb-sales-revenue-migration");
      console.log("Or run the SQL manually in Supabase SQL Editor.");
    }
  }

  if (!schemaCorrect) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
