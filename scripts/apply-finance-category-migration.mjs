#!/usr/bin/env node
/**
 * Apply wb_finance finance_category migration to remote Supabase.
 * Usage: npx tsx scripts/apply-finance-category-migration.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

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
    return { applied: false, reason: `management_api_${res.status}: ${body.slice(0, 300)}` };
  }
  return { applied: true, via: "management_api" };
}

async function applyViaPg(sql) {
  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? buildDbUrlFromPassword();
  if (!dbUrl) return { applied: false, reason: "no_db_url" };

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    return { applied: true, via: "postgres" };
  } finally {
    await client.end();
  }
}

async function applyMigration(sql) {
  for (const fn of [() => applyViaManagementApi(sql), () => applyViaPg(sql)]) {
    try {
      const result = await fn();
      if (result.applied) return result;
      console.warn("Apply attempt skipped:", result.reason);
    } catch (err) {
      console.warn("Apply attempt failed:", err instanceof Error ? err.message : err);
    }
  }
  return { applied: false };
}

async function hasFinanceCategoryColumn() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.from("wb_finance").select("finance_category").limit(1);
  return !error;
}

async function main() {
  loadEnv();

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260710120000_sprint_6_17c_finance_persistence.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  console.log("=== Sprint 6.17C: finance persistence migration ===\n");

  const before = await hasFinanceCategoryColumn();
  console.log(`finance_category column before: ${before ? "PRESENT" : "MISSING"}`);

  const result = await applyMigration(sql);
  if (!result.applied) {
    if (!before) {
      console.error(
        "\nFAIL: Could not apply migration automatically.\n" +
          "Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD / SUPABASE_DB_URL, or run SQL manually:\n" +
          migrationPath
      );
      process.exit(1);
    }
    console.warn(
      "\nWARN: Migration apply skipped (no DDL credentials). Continuing verification only."
    );
  } else {
    console.log(`Migration applied via ${result.via}.`);
  }

  const after = await hasFinanceCategoryColumn();
  console.log(`finance_category column after: ${after ? "PRESENT" : "MISSING"}`);

  if (!after) {
    console.error("\nFAIL: finance_category still missing after apply.");
    process.exit(1);
  }

  console.log("\n--- Post-migration schema verification ---");
  const verify = spawnSync(process.execPath, ["scripts/verify-finance-schema.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (verify.status !== 0) process.exit(verify.status ?? 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
