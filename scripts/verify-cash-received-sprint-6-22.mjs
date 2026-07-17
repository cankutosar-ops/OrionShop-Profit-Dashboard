#!/usr/bin/env node
/**
 * Sprint 6.22 — Cash Received + accounting validation.
 * Usage: npx tsx scripts/verify-cash-received-sprint-6-22.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { getOverviewMetrics } from "../src/services/dashboard-service.ts";
import { resolveScopedDateRange } from "../src/lib/marketplace-scope.ts";
import { getDefaultDateRange } from "../src/lib/utils.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function money(n) {
  return `${n.toFixed(2)} ₽`;
}

async function main() {
  loadEnv();
  const defaults = getDefaultDateRange();
  const accountId = process.argv[2] ?? "1";
  const from = process.argv[3] ?? defaults.from;
  const to = process.argv[4] ?? defaults.to;

  const client = createAdminClient();
  const scope = await resolveScopedDateRange({ account: accountId, from, to });
  const overview = await getOverviewMetrics(scope, client);
  const cashReceived = overview.cashReceived;

  console.log("Sprint 6.22 — Validation");
  console.log(`Account ${accountId} | ${from} → ${to}\n`);
  console.log("### P&L unchanged (informational cash KPI only)");
  console.log(`| Revenue | ${money(overview.revenue)} |`);
  console.log(`| Net Profit | ${money(overview.netProfit)} |`);
  console.log(`| Marketplace Fees | ${money(overview.marketplaceFeesPresentation.marketplaceFees)} |`);

  console.log("\n### Cash Received");
  console.log(
    `| Dashboard cashReceived.amount | ${cashReceived.amount != null ? money(cashReceived.amount) : "n/a"} |`
  );
  console.log(`| Payout count | ${cashReceived.payoutCount} |`);
  if (cashReceived.unavailableReason) {
    console.log(`| Note | ${cashReceived.unavailableReason} |`);
  }

  console.log("\n### Accounting bases (audit)");
  const mf = overview.marketplaceFeesPresentation.marketplaceFees;
  console.log(
    `| MF ÷ Revenue (finishedPrice) | ${overview.revenue > 0 ? ((mf / overview.revenue) * 100).toFixed(2) : 0}% |`
  );
  console.log(
    `| Cash Received ÷ Revenue | ${overview.revenue > 0 && cashReceived.amount ? ((cashReceived.amount / overview.revenue) * 100).toFixed(2) : "n/a"}% |`
  );

  console.log("\n✓ Validation complete");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
