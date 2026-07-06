#!/usr/bin/env node
/**
 * Sprint 4 Phase 2 deploy: migration → stock sync → validation.
 * Usage: npx tsx scripts/sprint4-phase2-deploy.mjs [marketplaceAccountId]
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function run(label, args) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync("npx", ["tsx", ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`\nStopped at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

loadEnv();

const accountId = process.argv[2] ?? "1";

run("Step 1 — Apply migration", ["scripts/apply-inventory-phase2-migration.mjs"]);
run("Step 2 — Stock sync", [
  "scripts/run-sprint2-sync-direct.mjs",
  "2026-05-24",
  "2026-06-23",
  "stock",
  accountId,
]);
run("Step 3 — Validation", ["scripts/validate-inventory-completion.mjs", accountId]);
