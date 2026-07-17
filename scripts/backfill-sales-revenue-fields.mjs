#!/usr/bin/env node
/**
 * Backfill wb_sales.price_with_disc and for_pay from the Wildberries Sales API.
 * Usage: npx tsx scripts/backfill-sales-revenue-fields.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { WbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { buildNetSalesFromDb } from "../src/lib/sales-revenue-resolution.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function countSalesState(accountId, from, to) {
  const client = createAdminClient();
  const { error: schemaError } = await client.from("wb_sales").select("price_with_disc").limit(1);
  if (schemaError) {
    return {
      total: null,
      nonReturns: null,
      withDisc: null,
      sumDisc: null,
      columnsMissing: true,
    };
  }

  const { data, error } = await client
    .from("wb_sales")
    .select("price_with_disc, is_return")
    .eq("marketplace_account_id", accountId)
    .gte("sale_date", from)
    .lte("sale_date", to);
  if (error) throw error;

  const rows = data ?? [];
  const nonReturns = rows.filter((row) => !row.is_return);
  const withDisc = nonReturns.filter((row) => Number(row.price_with_disc) > 0).length;

  return {
    total: rows.length,
    nonReturns: nonReturns.length,
    withDisc,
    sumDisc: buildNetSalesFromDb(rows).netSales,
  };
}

async function main() {
  loadEnv();

  const accountId = process.argv[2] ?? "1";
  const from = process.argv[3] ?? "2026-05-24";
  const to = process.argv[4] ?? "2026-07-05";

  console.log("=== Backfill wb_sales revenue fields ===");
  console.log(`Account: ${accountId}`);
  console.log(`Period:  ${from} → ${to}\n`);

  const before = await countSalesState(accountId, from, to);
  console.log("Before:", before);

  const account = await getMarketplaceAccountForSync(accountId);
  const client = new WbApiClient(account.apiKey);
  const sync = new WbSyncService(client, accountId);

  console.log("\nRunning sales sync (upserts price_with_disc + for_pay)...");
  const result = await sync.syncSales(from, to);
  console.log("Sync result:", {
    processed: result.recordsProcessed,
    updated: result.recordsUpdated,
    errors: result.errors.length,
  });
  if (result.errors.length) {
    console.warn("Errors:", result.errors.slice(0, 5));
  }

  const after = await countSalesState(accountId, from, to);
  console.log("\nAfter:", after);

  if (after.columnsMissing) {
    console.warn(
      "\nWARN: wb_sales.price_with_disc column missing — apply migration first:\n" +
        "  npm run apply:wb-sales-revenue-migration"
    );
    console.log(
      "Dashboard Model B uses Sales API fallback until columns are migrated and backfilled."
    );
    return;
  }

  if (after.nonReturns > 0 && after.sumDisc <= 0) {
    console.error("\nFAIL: price_with_disc still zero after sales sync.");
    process.exit(1);
  }

  console.log("\nOK: Model B Revenue (priceWithDisc) source populated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
