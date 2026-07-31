#!/usr/bin/env node
/**
 * Sprint 5 — apply purchases + purchase_lines migrations.
 *
 * Verify: PostgREST OpenAPI (SUPABASE_SERVICE_ROLE_KEY)
 * Apply:  Management API (SUPABASE_ACCESS_TOKEN) or PostgreSQL (SUPABASE_DB_URL / SUPABASE_DB_PASSWORD)
 *
 * Usage: npx tsx scripts/apply-purchase-migrations.mjs [--audit-only]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const PURCHASES_COLUMNS = [
  "id",
  "marketplace_account_id",
  "purchase_date",
  "supplier",
  "currency",
  "exchange_rate",
  "invoice_number",
  "notes",
  "created_at",
  "updated_at",
];

const PURCHASE_LINES_COLUMNS = [
  "id",
  "purchase_id",
  "product_id",
  "supplier_article",
  "quantity",
  "unit_cost",
  "created_at",
];

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

function printAudit() {
  console.log(`Purchase migration credential audit
────────────────────────────────────────────────────────────
Verify schema: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY

Apply DDL (pick one):
  A) SQL Editor — run migration files in order:
     supabase/migrations/20260628120000_purchase_records.sql
     supabase/migrations/20260629120000_purchase_ux_revision.sql
     supabase/migrations/20260731120000_purchase_invoice_number.sql
  B) Management API — SUPABASE_ACCESS_TOKEN or \`supabase login\`
  C) PostgreSQL — SUPABASE_DB_URL or SUPABASE_DB_PASSWORD
────────────────────────────────────────────────────────────
`);
}

async function fetchOpenApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return res.json();
}

async function checkSchema() {
  const spec = await fetchOpenApi();
  const purchasesProps = spec.definitions?.purchases?.properties ?? {};
  const linesProps = spec.definitions?.purchase_lines?.properties ?? {};
  const purchasesColumns = Object.keys(purchasesProps).sort();
  const linesColumns = Object.keys(linesProps).sort();

  const purchasesMissing = PURCHASES_COLUMNS.filter((col) => !(col in purchasesProps));
  const linesMissing = PURCHASE_LINES_COLUMNS.filter((col) => !(col in linesProps));
  const linesHasCurrency = "currency" in linesProps;

  return {
    purchasesColumns,
    linesColumns,
    purchasesMissing,
    linesMissing,
    linesHasCurrency,
    ready:
      purchasesMissing.length === 0 &&
      linesMissing.length === 0 &&
      !linesHasCurrency,
  };
}

function resolveAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    return readFileSync(resolve(process.env.HOME ?? "", ".config/supabase/access-token"), "utf8").trim();
  } catch {
    return null;
  }
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
    return { applied: false, reason: `management_api_${res.status}: ${body.slice(0, 200)}` };
  }
  return { applied: true };
}

function buildDbUrlFromPassword() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!password || !url) return null;
  const ref = new URL(url).hostname.split(".")[0];
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function applyViaPg(sql) {
  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL ?? buildDbUrlFromPassword();
  if (!dbUrl) return { applied: false, reason: "no_db_url" };

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    return { applied: true };
  } finally {
    await client.end();
  }
}

async function applyMigration(sql) {
  const attempts = [
    ["management_api", () => applyViaManagementApi(sql)],
    ["postgres", () => applyViaPg(sql)],
  ];
  for (const [via, fn] of attempts) {
    try {
      const result = await fn();
      if (result.applied) return { applied: true, via };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`${via} failed:`, message);
    }
  }
  return { applied: false };
}

async function main() {
  loadEnv();

  if (process.argv.includes("--audit-only")) {
    printAudit();
    return;
  }

  const migrations = [
    "20260628120000_purchase_records.sql",
    "20260629120000_purchase_ux_revision.sql",
    "20260731120000_purchase_invoice_number.sql",
  ];

  console.log("=== Purchase migrations (incl. Sprint 8.2 invoice_number) ===\n");

  let before = await checkSchema();
  console.log("Before purchases columns:", before.purchasesColumns.join(", ") || "(table missing)");
  console.log("Before purchase_lines columns:", before.linesColumns.join(", ") || "(table missing)");

  if (!before.ready) {
    for (const file of migrations) {
      const migrationPath = resolve(process.cwd(), "supabase/migrations", file);
      const sql = readFileSync(migrationPath, "utf8");
      console.log(`\nApplying ${file}...`);
      const applyResult = await applyMigration(sql);
      if (!applyResult.applied) {
        // Still try remaining files if early ones already applied
        if (file === "20260731120000_purchase_invoice_number.sql") {
          printAudit();
          console.log(`Manual apply: ${migrationPath}\n`);
          process.exit(1);
        }
        console.warn(`Could not apply ${file} (may already be applied). Continuing…`);
        continue;
      }
      console.log(`Applied via ${applyResult.via}.`);
    }
  } else {
    console.log("\nSchema already ready — skipping DDL apply.");
  }

  const after = await checkSchema();
  if (!after.ready) {
    console.log("\nFAIL — schema not ready after apply.");
    if (after.purchasesMissing.length) {
      console.log("  purchases missing:", after.purchasesMissing.join(", "));
    }
    if (after.linesMissing.length) {
      console.log("  purchase_lines missing:", after.linesMissing.join(", "));
    }
    if (after.linesHasCurrency) {
      console.log("  purchase_lines still has currency column (UX migration not applied)");
    }
    process.exit(1);
  }

  console.log("\nPASS — purchases and purchase_lines schema ready.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
