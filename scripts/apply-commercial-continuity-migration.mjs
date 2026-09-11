#!/usr/bin/env node
/**
 * Apply Commercial Data Continuity migration.
 * Usage: npx tsx scripts/apply-commercial-continuity-migration.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";
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
    return { applied: false, reason: `management_api_${res.status}: ${body.slice(0, 400)}` };
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

async function probe() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const checks = {};
  const { error: e1 } = await client.from("commercial_entity_sync_state").select("entity").limit(1);
  checks.commercial_entity_sync_state = !e1;
  const { error: e2 } = await client.from("commercial_sync_ticks").select("id").limit(1);
  checks.commercial_sync_ticks = !e2;
  const { error: e3 } = await client.from("sync_runs").select("id").limit(1);
  checks.sync_runs = !e3;
  return { checks, e1: e1?.message, e2: e2?.message, e3: e3?.message };
}

async function main() {
  loadEnv();
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260812130000_commercial_data_continuity.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  console.log("=== Commercial Data Continuity migration ===\n");
  const before = await probe();
  console.log("Before:", JSON.stringify(before.checks));

  const result = await applyMigration(sql);
  if (!result.applied) {
    console.error("FAIL: Could not apply migration. Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL.");
    process.exit(1);
  }
  console.log(`Applied via ${result.via}`);

  const after = await probe();
  console.log("After:", JSON.stringify(after.checks));
  if (!Object.values(after.checks).every(Boolean)) {
    console.error("FAIL: schema probe incomplete", after);
    process.exit(1);
  }
  console.log("\nOK: Commercial continuity schema present.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
