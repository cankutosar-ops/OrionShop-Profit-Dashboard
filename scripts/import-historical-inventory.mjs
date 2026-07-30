#!/usr/bin/env node
/**
 * Sprint 10 — import archived STOCK_HISTORY_DAILY CSVs into historical_inventory_snapshots.
 * Idempotent. Usage: npx tsx scripts/import-historical-inventory.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!(key in process.env) || !process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const { importHistoricalInventoryFromArchives } = await import(
  "../src/services/historical-inventory-import-service.ts"
);

const result = await importHistoricalInventoryFromArchives();
console.log(JSON.stringify(result, null, 2));

const failed = result.accountsProcessed.filter((a) => a.error);
if (failed.length) {
  console.error("Some accounts failed");
  process.exit(2);
}
if (result.totalParsed === 0) {
  console.warn(
    "No rows parsed — check exports/historical-inventory/ and that migration is applied"
  );
  process.exit(3);
}
console.log(`OK — parsed ${result.totalParsed}, upserted ${result.totalUpserted}`);
