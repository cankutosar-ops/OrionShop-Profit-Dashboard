#!/usr/bin/env node
/**
 * Sprint 2 deploy: apply migration → full sync → validate ALEXASIYAH01
 *
 * Usage: npx tsx scripts/sprint2-deploy.mjs [dateFrom] [dateTo]
 */

import { spawnSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

function run(label, args) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync("npx", ["tsx", ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status})`);
  }
}

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
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

async function main() {
  loadEnv();
  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";

  run("Step 1 — Apply migration", ["scripts/apply-sprint2-migration.mjs"]);
  run("Step 2 — Full sync", ["scripts/run-sprint2-sync.mjs", from, to]);
  run("Step 3 — Validate ALEXASIYAH01", ["scripts/sprint2-validate-alex.mjs", from, to]);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
