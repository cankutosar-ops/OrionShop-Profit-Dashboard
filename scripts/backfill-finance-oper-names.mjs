#!/usr/bin/env node
/**
 * @deprecated Use scripts/backfill-finance-categories.mjs — oper names are stored in supplier_oper_name column.
 * Backfill wb_finance.description with WB supplier_oper_name (for reimbursement split).
 * Usage: npx tsx scripts/backfill-finance-oper-names.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import { WbApiClient } from "../src/lib/wildberries/api-client.ts";
import { getMarketplaceAccountForSync } from "../src/services/marketplace-account-service.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function main() {
  loadEnv();
  const accountId = process.argv[2] ?? "1";
  const from = process.argv[3] ?? "2026-05-24";
  const to = process.argv[4] ?? "2026-06-23";

  const client = createAdminClient();
  const account = await getMarketplaceAccountForSync(accountId);
  const wb = new WbApiClient(account.apiKey);
  const raw = await wb.fetchFinanceReport(from, to);
  const operByRrd = new Map(raw.map((row) => [row.rrd_id, row.supplier_oper_name?.trim() || null]));

  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_finance")
      .select("id, source_key, description")
      .eq("marketplace_account_id", accountId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }

  let updated = 0;
  for (const row of rows) {
    const rrdId = Number(row.source_key?.match(/^rrd:(\d+)/)?.[1]);
    if (!rrdId) continue;
    const operName = operByRrd.get(rrdId);
    if (!operName || row.description === operName) continue;
    if (!row.description?.startsWith("rrd:") && row.description === operName) continue;

    const { error } = await client
      .from("wb_finance")
      .update({ description: operName })
      .eq("id", row.id);
    if (error) throw error;
    updated += 1;
  }

  console.log(`Backfilled ${updated} / ${rows.length} finance row descriptions for account ${accountId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
