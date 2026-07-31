#!/usr/bin/env node
/**
 * Apply Sprint 10.1 warehouse platform foundation migration.
 * Usage: npx tsx scripts/apply-warehouse-platform-foundation-10-1.mjs
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

async function tableReady() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await client.from("warehouse_checkpoints").select("id").limit(1);
  return !error;
}

async function main() {
  loadEnv();
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260731140000_warehouse_platform_foundation_10_1.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");
  console.log("=== Sprint 10.1 — warehouse platform foundation ===\n");

  if (await tableReady()) {
    console.log("warehouse_checkpoints already present — skip DDL.");
    process.exit(0);
  }

  for (const fn of [applyViaManagementApi, applyViaPg]) {
    try {
      const result = await fn(sql);
      if (result.applied) {
        console.log(`Applied via ${result.via}.`);
        const ok = await tableReady();
        console.log(ok ? "\nPASS — foundation tables ready." : "\nFAIL — tables still missing.");
        process.exit(ok ? 0 : 1);
      }
      console.warn("Apply skipped:", result.reason);
    } catch (err) {
      console.warn("Apply failed:", err instanceof Error ? err.message : err);
    }
  }

  console.error(
    "\nFAIL: Could not apply automatically.\n" +
      "Run in Supabase SQL Editor:\n" +
      migrationPath
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
