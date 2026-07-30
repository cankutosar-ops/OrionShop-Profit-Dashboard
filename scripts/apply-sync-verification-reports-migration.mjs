#!/usr/bin/env node
/**
 * Apply sync_verification_reports migration (Sprint 9.5).
 * Usage: npx tsx scripts/apply-sync-verification-reports-migration.mjs
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

async function tableExists() {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await client.from("sync_verification_reports").select("id").limit(1);
  return !error || !/does not exist|Could not find the table/i.test(error.message);
}

async function main() {
  loadEnv();
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260724190000_sync_verification_reports.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");
  console.log("=== Sprint 9.5 sync_verification_reports ===\n");

  if (await tableExists()) {
    console.log("Table already present — migration skipped.");
    return;
  }

  for (const fn of [() => applyViaManagementApi(sql), () => applyViaPg(sql)]) {
    try {
      const result = await fn();
      if (result.applied) {
        console.log(`Migration applied via ${result.via}.`);
        if (!(await tableExists())) {
          console.error("FAIL: table still missing after apply.");
          process.exit(1);
        }
        console.log("OK: sync_verification_reports is available.");
        return;
      }
      console.warn("Apply attempt skipped:", result.reason);
    } catch (err) {
      console.warn("Apply attempt failed:", err instanceof Error ? err.message : err);
    }
  }

  console.error(
    "\nFAIL: Could not apply migration automatically.\n" +
      "Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD / SUPABASE_DB_URL, or run SQL manually:\n" +
      migrationPath
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
