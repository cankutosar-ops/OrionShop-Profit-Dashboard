#!/usr/bin/env node
/**
 * Apply marketplace account lifecycle migration.
 * Usage: npm run apply:account-lifecycle-migration
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

async function probeColumns() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await client
    .from("marketplace_accounts")
    .select("sync_lifecycle_status,finance_backfill_progress,finance_backfill_from,finance_backfill_to,finance_backfill_verified_at")
    .limit(5);

  const statuses = (data ?? []).map((row) => row.sync_lifecycle_status);
  const unearnedHealthy = (data ?? []).filter(
    (row) => row.sync_lifecycle_status === "HEALTHY" && row.finance_backfill_verified_at == null
  );

  return {
    ok: !error,
    error: error?.message ?? null,
    sampleStatuses: statuses,
    unearnedHealthyCount: unearnedHealthy.length,
  };
}

async function main() {
  loadEnv();
  const migrations = [
    "supabase/migrations/20260722210000_marketplace_account_lifecycle.sql",
    "supabase/migrations/20260722220000_account_verification_before_healthy.sql",
  ];

  console.log("=== Marketplace Account Lifecycle + ACCOUNT_VERIFICATION ===\n");
  const before = await probeColumns();
  console.log("Before:", before);

  for (const relative of migrations) {
    const migrationPath = resolve(process.cwd(), relative);
    const sql = readFileSync(migrationPath, "utf8");
    console.log(`\nApplying ${relative}...`);
    const result = await applyMigration(sql);
    if (!result.applied) {
      console.error("FAIL: Could not apply migration. Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_URL.");
      console.error(migrationPath);
      process.exit(1);
    }
    console.log(`Applied via ${result.via}`);
  }

  const after = await probeColumns();
  console.log("\nAfter:", after);
  if (!after.ok) {
    console.error("FAIL: schema probe incomplete", after);
    process.exit(1);
  }
  if (after.unearnedHealthyCount > 0) {
    console.error(
      "FAIL: found HEALTHY accounts without finance_backfill_verified_at — migration did not demote them"
    );
    process.exit(1);
  }
  console.log("\nOK: Lifecycle schema present; HEALTHY requires verification timestamp.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
