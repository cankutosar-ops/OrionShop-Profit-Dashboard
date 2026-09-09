#!/usr/bin/env node
/**
 * Apply the wb_ads account-scope + idempotency migration.
 * Usage: npx tsx scripts/apply-wb-ads-account-scope-migration.mjs
 *
 * Additive schema only (adds marketplace_account_id, source_key, campaign_id,
 * updated_at, a unique conflict target and account-scoped RLS). Re-runnable.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const MIGRATION = "supabase/migrations/20260909090000_wb_ads_account_scope_and_idempotency.sql";

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
    return { applied: false, reason: `management_api_${res.status}: ${body.slice(0, 500)}` };
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

async function main() {
  loadEnv();
  const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

  let result = await applyViaPg(sql);
  if (!result.applied) {
    console.log("Postgres apply skipped:", result.reason);
    result = await applyViaManagementApi(sql);
  }

  if (!result.applied) {
    console.error("FAILED to apply migration:", result.reason);
    console.error("Apply manually in Supabase SQL Editor:");
    console.error(`  ${MIGRATION}`);
    process.exit(1);
  }

  console.log("Applied wb_ads account-scope migration via", result.via);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
