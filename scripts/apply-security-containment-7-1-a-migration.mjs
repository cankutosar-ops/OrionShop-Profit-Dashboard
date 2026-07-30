#!/usr/bin/env node
/**
 * Apply Sprint 7.1.A security containment migration.
 * Usage: npx tsx scripts/apply-security-containment-7-1-a-migration.mjs
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

async function verifyContainment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, reason: "missing_anon_env" };

  const client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const checks = [];
  for (const table of ["wb_sales", "marketplace_accounts", "historical_inventory_snapshots"]) {
    const { data, error } = await client.from(table).select("*").limit(1);
    const blocked =
      Boolean(error) ||
      (Array.isArray(data) && data.length === 0 && error) ||
      (error && /permission|rls|policy/i.test(error.message));
    // Empty success with 0 rows could mean empty table OR blocked depending on PostgREST.
    // Prefer explicit error for revoke.
    checks.push({
      table,
      error: error?.message ?? null,
      rowCount: Array.isArray(data) ? data.length : null,
      blocked: Boolean(error),
    });
  }

  const { error: insertError } = await client.from("sync_verification_reports").insert({
    marketplace_account_id: 1,
    expected_as_of: "2000-01-01",
    health_score: 0,
    overall_result: "FAIL",
    schema_status: "FAIL",
    orders_status: "FAIL",
    sales_status: "FAIL",
    finance_status: "FAIL",
    inventory_status: "FAIL",
    snapshot: {},
  });

  return {
    ok: true,
    selectChecks: checks,
    anonInsertBlocked: Boolean(insertError),
    insertError: insertError?.message ?? null,
  };
}

async function main() {
  loadEnv();
  const sqlPath = resolve(
    process.cwd(),
    "supabase/migrations/20260729140000_security_containment_7_1_a.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");

  let result = await applyViaPg(sql);
  if (!result.applied) {
    console.warn("[containment] postgres apply skipped:", result.reason);
    result = await applyViaManagementApi(sql);
  }

  if (!result.applied) {
    console.error("[containment] FAILED to apply migration:", result.reason);
    console.error("Apply supabase/migrations/20260729140000_security_containment_7_1_a.sql via SQL Editor.");
    process.exit(1);
  }

  console.log("[containment] migration applied via", result.via);
  const verification = await verifyContainment();
  console.log("[containment] anon verification:", JSON.stringify(verification, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
