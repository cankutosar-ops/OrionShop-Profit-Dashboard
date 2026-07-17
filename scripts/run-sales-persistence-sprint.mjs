#!/usr/bin/env node
/**
 * Run full sales persistence sprint: migrate → backfill both accounts → validate.
 * Requires SUPABASE_DB_PASSWORD or SUPABASE_ACCESS_TOKEN in .env.local
 *
 * Usage: npx tsx scripts/run-sales-persistence-sprint.mjs [from] [to]
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.argv[2] ?? "2026-01-01";
const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);

function run(label, args) {
  console.log(`\n>>> ${label}`);
  const result = spawnSync("npx", ["tsx", ...args], {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status})`);
  }
}

async function main() {
  run("Step 0 — Validate database environment (schema gate)", [
    "scripts/validate-db-environment.mjs",
  ]);
  run("Step 1 — Apply migration", ["scripts/apply-wb-sales-revenue-migration.mjs"]);
  run("Step 2 — Backfill Default Company (account 1)", [
    "scripts/backfill-sales-history.mjs",
    "1",
    from,
    to,
    "monthly",
  ]);
  run("Step 3 — Backfill Orion Shop (account 2)", [
    "scripts/backfill-sales-history.mjs",
    "2",
    from,
    to,
    "monthly",
  ]);
  run("Step 4 — Validate both accounts", [
    "scripts/validate-sales-persistence.mjs",
    from,
    to,
  ]);
  run("Step 5 — Full revenue reconciliation", [
    "scripts/verify-sales-revenue-sprint.mjs",
    from,
    to,
  ]);
  console.log("\nOK: sales persistence sprint complete");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
