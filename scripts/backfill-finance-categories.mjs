#!/usr/bin/env node
/**
 * Backfill wb_finance normalized categories for historical rows.
 * Usage: npx tsx scripts/backfill-finance-categories.mjs [accountId] [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  inferCategoryFromLegacy,
  parseWbSourceSuffix,
  resolveSupplierOperName,
} from "../src/lib/finance-category.ts";
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

async function fetchFinanceRows(client, accountId, from, to) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_finance")
      .select(
        "id, source_key, description, operation_type, finance_category, wb_source_suffix, supplier_oper_name"
      )
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
  const to = process.argv[4] ?? "2026-06-23";
  const fetchOperNames = process.argv.includes("--fetch-oper-names");

  const client = createAdminClient();
  const rows = await fetchFinanceRows(client, accountId, from, to);

  let operByRrd = new Map();
  if (fetchOperNames) {
    const account = await getMarketplaceAccountForSync(accountId);
    const wb = new WbApiClient(account.apiKey);
    const raw = await wb.fetchFinanceReport(from, to);
    operByRrd = new Map(raw.map((row) => [row.rrd_id, row.supplier_oper_name?.trim() || null]));
  }

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    const rrdId = Number(row.source_key?.match(/^rrd:(\d+)/)?.[1]);
    const operName =
      row.supplier_oper_name ??
      resolveSupplierOperName(row) ??
      (rrdId ? operByRrd.get(rrdId) ?? null : null);

    const financeCategory = inferCategoryFromLegacy({
      ...row,
      wb_source_suffix: suffix || row.wb_source_suffix,
      supplier_oper_name: operName,
    });

    const patch = {
      finance_category: financeCategory,
      wb_source_suffix: suffix || row.wb_source_suffix,
      supplier_oper_name: operName,
    };

    if (
      row.finance_category === patch.finance_category &&
      row.wb_source_suffix === patch.wb_source_suffix &&
      row.supplier_oper_name === patch.supplier_oper_name
    ) {
      skipped += 1;
      continue;
    }

    const { error } = await client.from("wb_finance").update(patch).eq("id", row.id);
    if (error) throw error;
    updated += 1;
  }

  console.log(
    `Backfilled ${updated} / ${rows.length} finance rows (${skipped} unchanged) for account ${accountId}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
