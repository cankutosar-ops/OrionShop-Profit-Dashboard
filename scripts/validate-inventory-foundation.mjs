#!/usr/bin/env node
/**
 * Sprint 4 Phase 1 — Inventory foundation validation.
 * Compares wb_stock cache + SKU mapping against live Wildberries Statistics API.
 *
 * Usage: npx tsx scripts/validate-inventory-foundation.mjs [marketplaceAccountId]
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

console.log("=== Sprint 4 Phase 1 — Inventory Foundation Validation ===\n");

console.log("--- 1. Stock flow audit ---");
console.log("products          → nm_id, supplier_article, marketplace_account_id");
console.log("product_variants  → tech_size, barcode per product (catalog SKU)");
console.log("wb_stock          → quantity per product × size × barcode × warehouse");
console.log("WB Statistics API → GET /api/v1/supplier/stocks (Seller Panel source)");
console.log("syncStock()       → mapApiStockRowToDb → wb_stock upsert\n");

const { resolveMarketplaceAccountId } = await import(
  "../src/services/marketplace-account-service.ts"
);
const {
  getInventoryForAccount,
} = await import("../src/services/inventory-service.ts");
const { validateInventoryDataChain } = await import(
  "../src/services/inventory-validation-service.ts"
);

const { marketplaceAccountId } = accountArg
  ? { marketplaceAccountId: accountArg }
  : await resolveMarketplaceAccountId(null, null);

console.log(`Marketplace account: ${marketplaceAccountId}\n`);

let pass = true;

try {
  const dbInventory = await getInventoryForAccount(marketplaceAccountId);
  console.log("--- 2. DB inventory service ---");
  console.log(`Rows: ${dbInventory.length}`);
  if (dbInventory.length === 0) {
    console.log("FAIL — no wb_stock rows. Run Sync with entity stock first.");
    pass = false;
  } else {
    const sample = dbInventory[0];
    console.log("Sample row fields:", {
      productId: sample.productId,
      marketplaceAccountId: sample.marketplaceAccountId,
      techSize: sample.techSize,
      barcode: sample.barcode,
      warehouse: sample.warehouse,
      availableStock: sample.availableStock,
      currentStock: sample.currentStock,
      reservedStock: sample.reservedStock,
    });
    const required = [
      "productId",
      "marketplaceAccountId",
      "techSize",
      "barcode",
      "warehouse",
      "availableStock",
      "currentStock",
      "reservedStock",
    ];
    const missing = required.filter((field) => sample[field] === undefined);
    if (missing.length) {
      console.log("FAIL — missing fields:", missing.join(", "));
      pass = false;
    } else {
      console.log("PASS — inventory service exposes all required fields");
    }
  }

  console.log("\n--- 3. Validation chain (API → wb_stock → service) ---");
  const result = await validateInventoryDataChain(marketplaceAccountId);
  console.log(JSON.stringify(result, null, 2));

  if (!result.pass) pass = false;

  console.log("\n=== RESULT ===");
  console.log(pass && result.pass ? "PASS" : "FAIL");
  process.exit(pass && result.pass ? 0 : 1);
} catch (error) {
  console.error("\nFAIL —", error instanceof Error ? error.message : error);
  process.exit(1);
}
