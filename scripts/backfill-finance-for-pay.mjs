#!/usr/bin/env node
/**
 * Backfill wb_finance for_pay lines (ppvz_for_pay) from the Wildberries finance report.
 * Usage: npx tsx scripts/backfill-finance-for-pay.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { WbSyncService } from "../src/lib/wildberries/sync-service.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { sumNetForPayFromFinance, countFinanceForPayLines } from "../src/lib/wb-settlement.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function fetchFinanceInRange(accountId, from, to) {
  const client = createAdminClient();
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_finance")
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function main() {
  loadEnv();

  const accountId = process.argv[2] ?? "1";
  const from = process.argv[3] ?? "2026-05-24";
  const to = process.argv[4] ?? "2026-07-05";

  console.log("=== Backfill wb_finance for_pay lines ===");
  console.log(`Account: ${accountId}`);
  console.log(`Period:  ${from} → ${to}\n`);

  const beforeFinance = await fetchFinanceInRange(accountId, from, to);
  console.log("Before:", {
    financeRows: beforeFinance.length,
    forPayLines: countFinanceForPayLines(beforeFinance),
    netForPay: sumNetForPayFromFinance(beforeFinance),
  });

  const account = await getMarketplaceAccountForSync(accountId);
  const client = new WbApiClient(account.apiKey);
  const sync = new WbSyncService(client, accountId);

  console.log("\nRunning finance sync (upserts ppvz_for_pay as for_pay lines)...");
  const result = await sync.syncFinance(from, to);
  console.log("Sync result:", {
    processed: result.recordsProcessed,
    updated: result.recordsUpdated,
    errors: result.errors.length,
  });
  if (result.errors.length) {
    console.warn("Errors:", result.errors.slice(0, 5));
  }

  const afterFinance = await fetchFinanceInRange(accountId, from, to);
  const netForPay = sumNetForPayFromFinance(afterFinance);
  console.log("\nAfter:", {
    financeRows: afterFinance.length,
    forPayLines: countFinanceForPayLines(afterFinance),
    netForPay,
  });

  if (countFinanceForPayLines(afterFinance) === 0) {
    console.warn(
      "\nWARN: No for_pay finance lines after sync — Model C will use weekly WB reports fallback."
    );
  } else {
    console.log("\nOK: Model C / WB Settlement netForPay source populated from finance.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
