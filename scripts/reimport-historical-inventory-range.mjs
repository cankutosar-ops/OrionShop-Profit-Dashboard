#!/usr/bin/env node
/**
 * Replace historical snapshot dates from archives (no mixed daily grains).
 * Usage: npx tsx scripts/reimport-historical-inventory-range.mjs [from] [to]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
    }
  }
}

loadEnv();

const from = process.argv[2] || "2026-07-17";
const to = process.argv[3] || "2026-07-26";

const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const { importHistoricalInventoryFromArchives } = await import(
  "../src/services/historical-inventory-import-service.ts"
);

const sb = createAdminClient();
for (const accountId of [1, 2]) {
  const { error, count } = await sb
    .from("historical_inventory_snapshots")
    .delete({ count: "exact" })
    .eq("marketplace_account_id", accountId)
    .gte("snapshot_date", from)
    .lte("snapshot_date", to);
  if (error) {
    console.error("delete failed", accountId, error.message);
    process.exit(1);
  }
  console.log(`deleted account ${accountId}: ${count ?? 0} rows (${from}..${to})`);
}

const result = await importHistoricalInventoryFromArchives(undefined, {
  accountIds: [1, 2],
});
console.log(JSON.stringify(result, null, 2));
if (result.accountsProcessed.some((a) => a.error)) process.exit(2);
