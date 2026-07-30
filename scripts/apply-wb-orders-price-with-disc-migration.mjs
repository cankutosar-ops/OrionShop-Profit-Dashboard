#!/usr/bin/env node
/**
 * Apply wb_orders price_with_disc / last_change_date migration to remote Supabase.
 * Sprint 9.3 — applies ONLY supabase/migrations/20260712200000_wb_orders_price_with_disc.sql
 *
 * Usage: npx tsx scripts/apply-wb-orders-price-with-disc-migration.mjs
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

async function probeOrdersColumns() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const price = await client.from("wb_orders").select("price_with_disc").limit(1);
  const change = await client.from("wb_orders").select("last_change_date").limit(1);
  return {
    price_with_disc: !price.error,
    last_change_date: !change.error,
    priceError: price.error?.message ?? null,
    changeError: change.error?.message ?? null,
  };
}

async function main() {
  loadEnv();

  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20260712200000_wb_orders_price_with_disc.sql"
  );
  const sql = readFileSync(migrationPath, "utf8");

  console.log("=== Sprint 9.3 wb_orders price_with_disc / last_change_date ===\n");
  console.log(`Migration file: ${migrationPath}\n`);

  const before = await probeOrdersColumns();
  console.log("Before:");
  console.log(`  price_with_disc: ${before.price_with_disc ? "PRESENT" : "MISSING"}`);
  console.log(`  last_change_date: ${before.last_change_date ? "PRESENT" : "MISSING"}`);

  if (before.price_with_disc && before.last_change_date) {
    console.log("\nColumns already present — migration skipped.");
  } else {
    const result = await applyMigration(sql);
    if (!result.applied) {
      console.error(
        "\nFAIL: Could not apply migration automatically.\n" +
          "Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD / SUPABASE_DB_URL, or run SQL manually:\n" +
          migrationPath
      );
      process.exit(1);
    }
    console.log(`\nMigration applied via ${result.via}.`);
  }

  const after = await probeOrdersColumns();
  console.log("\nAfter:");
  console.log(`  price_with_disc: ${after.price_with_disc ? "PRESENT" : "MISSING"}`);
  console.log(`  last_change_date: ${after.last_change_date ? "PRESENT" : "MISSING"}`);

  if (!after.price_with_disc || !after.last_change_date) {
    console.error("\nFAIL: wb_orders columns still missing after apply.");
    process.exit(1);
  }

  console.log("\nOK: wb_orders.price_with_disc and wb_orders.last_change_date are available.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
