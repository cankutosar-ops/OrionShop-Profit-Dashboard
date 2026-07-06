#!/usr/bin/env node
/**
 * Sprint 4 Phase 2 — Inventory data completion validation.
 * Chain: Wildberries Seller Panel (API) → wb_stock → Inventory Service
 *
 * Usage: npx tsx scripts/validate-inventory-completion.mjs [marketplaceAccountId]
 */

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

const accountArg = process.argv[2];
const REQUIRED_WB_STOCK_COLUMNS = [
  "quantity",
  "quantity_full",
  "in_way_to_client",
  "in_way_from_client",
  "last_synced_at",
];

async function assertWbStockSchema() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const spec = await res.json();
  const props = spec.definitions?.wb_stock?.properties ?? {};
  const missing = REQUIRED_WB_STOCK_COLUMNS.filter((col) => !(col in props));
  if (missing.length) {
    throw new Error(
      `wb_stock missing columns: ${missing.join(", ")}. Apply supabase/migrations/20260627120000_wb_stock_inventory_fields.sql then re-run stock sync.`
    );
  }
}

console.log("=== Sprint 4 Phase 2 — Inventory Data Completion ===\n");
console.log("Chain: WB API (Seller Panel) → wb_stock → Inventory Service\n");

const { resolveMarketplaceAccountId } = await import(
  "../src/services/marketplace-account-service.ts"
);
const { validateInventoryDataChain } = await import(
  "../src/services/inventory-validation-service.ts"
);

const { marketplaceAccountId } = accountArg
  ? { marketplaceAccountId: accountArg }
  : await resolveMarketplaceAccountId(null, null);

console.log(`Marketplace account: ${marketplaceAccountId}\n`);

try {
  await assertWbStockSchema();
  const result = await validateInventoryDataChain(marketplaceAccountId);

  console.log("--- wb_stock vs WB API ---");
  console.log(`Matched keys: ${result.matchedRows}`);
  console.log(`wb_stock mismatches: ${result.wbStockMismatches?.length ?? 0}`);
  if (result.wbStockMismatches?.length) {
    console.log(JSON.stringify(result.wbStockMismatches.slice(0, 5), null, 2));
  }

  console.log("\n--- Inventory Service vs WB API ---");
  console.log(`Service mismatches: ${result.mismatches.length - (result.wbStockMismatches?.length ?? 0)}`);
  console.log(JSON.stringify(result, null, 2));

  console.log("\n=== RESULT ===");
  console.log(result.pass ? "PASS" : "FAIL");

  if (!result.pass && result.dbRowCount > 0 && (result.wbStockMismatches?.length ?? 0) > 0) {
    console.log("\nHint: apply migration 20260627120000_wb_stock_inventory_fields.sql");
    console.log("      then re-run stock sync: POST /api/sync with entities: [\"stock\"]");
  }

  process.exit(result.pass ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("\nFAIL —", message);
  if (message.includes("quantity_full") || message.includes("last_synced_at")) {
    console.error("\nApply: supabase/migrations/20260627120000_wb_stock_inventory_fields.sql");
    console.error("Then re-run stock sync.");
  }
  process.exit(1);
}
