#!/usr/bin/env node
/** Remove legacy validate-cost-template.mjs batch from a marketplace account. */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const dryRun = process.argv.includes("--dry-run");

const {
  getValidationAccountId,
  assertProductionValidationAllowed,
  deleteLegacyCostTemplateRun,
  LEGACY_COST_TEMPLATE_RUN,
} = await import("./lib/validation-isolation.mjs");

const accountId = getValidationAccountId(process.argv[2] ?? "2");

if (!dryRun) {
  assertProductionValidationAllowed(accountId);
}

console.log(`=== Cleanup validate-cost-template batch (account ${accountId}) ===\n`);
console.log("Run window:", LEGACY_COST_TEMPLATE_RUN);

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const supabase = createAdminClient();
const result = await deleteLegacyCostTemplateRun(supabase, accountId, { dryRun });

console.log(dryRun ? `Would delete ${result.matched} row(s)` : `Matched: ${result.matched}, deleted: ${result.deleted}`);
console.log("\nDone.");
