#!/usr/bin/env node
/**
 * Run validation scripts with automatic cleanup and verify production data is unchanged.
 *
 * Usage:
 *   VALIDATION_ALLOW_PRODUCTION=1 VALIDATION_CONFIRM=YES npx tsx scripts/run-production-safe-validation.mjs [accountId]
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

loadEnv();

const { getValidationAccountId, assertProductionValidationAllowed } = await import(
  "./lib/validation-isolation.mjs"
);

const accountId = getValidationAccountId(process.argv[2] ?? "2");

function run(label, script, args = []) {
  console.log(`\n--- ${label} ---`);
  const result = spawnSync("npx", ["tsx", script, accountId, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    console.error(`FAIL  ${label}`);
    process.exit(result.status ?? 1);
  }
  console.log(`PASS  ${label}`);
}

console.log("=== Production-safe validation ===");
console.log("Account:", accountId);

try {
  assertProductionValidationAllowed(accountId);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

run("verify-real-costs-preserved (before)", "scripts/verify-real-costs-preserved.mjs");
run("validate-cost-template.mjs", "scripts/validate-cost-template.mjs");
run("validate-cost-inline-edit.mjs", "scripts/validate-cost-inline-edit.mjs");
run("validate-purchase-records.mjs", "scripts/validate-purchase-records.mjs");
run("validate-latest-cost-resolution.mjs", "scripts/validate-latest-cost-resolution.mjs");
run("verify-no-synthetic-costs.mjs", "scripts/verify-no-synthetic-costs.mjs");
run("verify-real-costs-preserved (after)", "scripts/verify-real-costs-preserved.mjs");

console.log("\n=== ALL PASS ===");
