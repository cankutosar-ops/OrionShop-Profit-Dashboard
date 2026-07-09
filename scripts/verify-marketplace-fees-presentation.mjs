#!/usr/bin/env node
/**
 * Verify Sprint 6.10 Marketplace Fees presentation split.
 * Usage: npx tsx scripts/verify-marketplace-fees-presentation.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { buildProfitBreakdown } from "../src/lib/profit-calculator.ts";
import { buildMarketplaceFeesPresentation } from "../src/lib/marketplace-fees-presentation.ts";
import { buildProfitabilityV2 } from "../src/lib/profitability-v2.ts";
import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function fetchInRange(client, table, dateCol, accountId, from, to) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("marketplace_account_id", accountId)
      .gte(dateCol, from)
      .lte(dateCol, to)
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
  const to = process.argv[4] ?? "2026-06-23";

  const client = createAdminClient();
  const scope = await resolveScopedDateRange({ account: accountId, from, to });

  const [sales, finance, ads] = await Promise.all([
    fetchInRange(client, "wb_sales", "sale_date", accountId, from, to),
    fetchInRange(client, "wb_finance", "operation_date", accountId, from, to),
    fetchInRange(client, "wb_ads", "campaign_date", accountId, from, to),
  ]);

  const breakdown = buildProfitBreakdown({ sales, finance, ads, costHistory: [] });
  const profitV2 = buildProfitabilityV2(breakdown);
  const presentation = buildMarketplaceFeesPresentation(finance, breakdown.commission);

  console.log("Sprint 6.10 — Marketplace Fees presentation verification");
  console.log("=========================================================");
  console.log(`Account: ${accountId}  Range: ${from} → ${to}`);
  console.log("");
  console.log(`1. Old Marketplace Fees (profitV2):     ${profitV2.marketplaceFees.toFixed(2)} ₽`);
  console.log(`   (= legacyMarketplaceFees):            ${presentation.legacyMarketplaceFees.toFixed(2)} ₽`);
  console.log(`2. New Marketplace Fees (service fees): ${presentation.marketplaceServiceFees.toFixed(2)} ₽`);
  console.log(`3. Account Adjustments:                 ${presentation.accountAdjustments.toFixed(2)} ₽`);
  console.log(`   Reimbursements (excluded from KPI):  ${presentation.reimbursements.toFixed(2)} ₽`);
  console.log("");
  console.log(`4. Net Profit (unchanged):              ${breakdown.netProfit.toFixed(2)} ₽`);
  console.log("");
  console.log(
    "Check: legacyMarketplaceFees = newMarketplaceFees + accountAdjustments + reimbursements + other misc:",
    (
      presentation.marketplaceServiceFees -
      breakdown.commission +
      presentation.accountAdjustments +
      presentation.reimbursements
    ).toFixed(2),
    "of other bucket (excl. service fee suffixes)"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
