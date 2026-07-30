#!/usr/bin/env node
/**
 * Apply Sprint 11 Historical Data Warehouse foundation migration.
 * Usage: npx tsx scripts/apply-historical-data-warehouse-foundation-migration.mjs
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
      /* optional */
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

loadEnv();

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726150000_historical_data_warehouse_foundation.sql"
  ),
  "utf8"
);

let result = await applyViaManagementApi(sql);
if (!result.applied) {
  console.warn("Management API:", result.reason);
  result = await applyViaPg(sql);
}

if (!result.applied) {
  console.error("FAILED — apply SQL manually in Supabase SQL Editor.");
  console.error(result.reason || "unknown");
  process.exit(1);
}

console.log("Applied via", result.via);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });
const { error: e1 } = await sb.from("warehouse_entity_sync_state").select("id").limit(1);
const { error: e2 } = await sb.from("warehouse_import_audit").select("id").limit(1);
if (e1 || e2) {
  console.error("Probe failed:", e1?.message || e2?.message);
  process.exit(2);
}
console.log("Probe OK — warehouse_entity_sync_state + warehouse_import_audit readable");
