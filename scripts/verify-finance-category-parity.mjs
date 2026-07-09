#!/usr/bin/env node
/**
 * Verify Sprint 6.11 finance categorization parity with legacy profit engine.
 * Usage: npx tsx scripts/verify-finance-category-parity.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { buildProfitBreakdown, sumFinanceByType } from "../src/lib/profit-calculator.ts";
import { FINANCE_OPERATION_TYPES } from "../src/types/database.ts";
import { buildMarketplaceFeesPresentationFromFinance } from "../src/lib/finance-rollup.ts";
import { buildProfitabilityV2 } from "../src/lib/profitability-v2.ts";
import { createAdminClient } from "../src/lib/supabase/admin.ts";

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

function legacySumFinanceExpenses(finance) {
  const byType = FINANCE_OPERATION_TYPES.reduce((acc, type) => {
    acc[type] = sumFinanceByType(finance, type);
    return acc;
  }, {});

  const unclassified = finance
    .filter((record) => !FINANCE_OPERATION_TYPES.includes(record.operation_type))
    .reduce((sum, record) => sum + Math.abs(Number(record.amount)), 0);

  const total =
    FINANCE_OPERATION_TYPES.reduce((sum, type) => sum + byType[type], 0) + unclassified;

  return { ...byType, unclassified, total };
}

function assertClose(label, a, b, tolerance = 0.01) {
  const diff = Math.abs(a - b);
  if (diff > tolerance) {
    throw new Error(`${label} mismatch: legacy=${a.toFixed(2)} rollup=${b.toFixed(2)} diff=${diff.toFixed(2)}`);
  }
}

async function main() {
  loadEnv();
  const accountId = process.argv[2] ?? "1";
  const from = process.argv[3] ?? "2026-05-24";
  const to = process.argv[4] ?? "2026-06-23";

  const client = createAdminClient();
  const [sales, finance] = await Promise.all([
    fetchInRange(client, "wb_sales", "sale_date", accountId, from, to),
    fetchInRange(client, "wb_finance", "operation_date", accountId, from, to),
  ]);

  const ads = [];
  let adsOffset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_ads")
      .select("*")
      .gte("campaign_date", from)
      .lte("campaign_date", to)
      .range(adsOffset, adsOffset + 999);
    if (error) throw error;
    ads.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    adsOffset += 1000;
  }

  const breakdown = buildProfitBreakdown({ sales, finance, ads, costHistory: [] });
  const legacyTotals = legacySumFinanceExpenses(finance);
  const profitV2 = buildProfitabilityV2(breakdown);
  const presentation = buildMarketplaceFeesPresentationFromFinance(finance, breakdown.commission);

  console.log("Sprint 6.11 — Finance category parity verification");
  console.log("===================================================");
  console.log(`Account: ${accountId}  Range: ${from} → ${to}`);
  console.log(`Finance rows: ${finance.length}`);
  console.log("");

  assertClose("commission", legacyTotals.commission, breakdown.commission);
  assertClose("logistics", legacyTotals.logistics, breakdown.logistics);
  assertClose("return_logistics", legacyTotals.return_logistics, breakdown.returnLogistics);
  assertClose("storage", legacyTotals.storage, breakdown.storage);
  assertClose("penalty", legacyTotals.penalty, breakdown.penalties);
  assertClose(
    "other",
    legacyTotals.other + legacyTotals.unclassified,
    breakdown.otherExpenses
  );

  const legacyMarketplaceFees = breakdown.commission + breakdown.otherExpenses;
  assertClose("legacyMarketplaceFees", profitV2.marketplaceFees, presentation.legacyMarketplaceFees);
  assertClose("legacyMarketplaceFees (calc)", legacyMarketplaceFees, presentation.legacyMarketplaceFees);

  console.log(`Net Profit:              ${breakdown.netProfit.toFixed(2)} ₽`);
  console.log(`Marketplace Fees (new):  ${presentation.marketplaceServiceFees.toFixed(2)} ₽`);
  console.log(`Account Adjustments:     ${presentation.accountAdjustments.toFixed(2)} ₽`);
  console.log(`Reimbursements:          ${presentation.reimbursements.toFixed(2)} ₽`);
  console.log("");
  console.log("✓ All parity checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
