#!/usr/bin/env node
/**
 * Audit marketplace account data isolation — read-only investigation.
 * Usage: npx tsx scripts/audit-marketplace-account-data.mjs [accountId]
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

const accountId = process.argv[2] ?? "2";

async function countTable(client, table, accountColumn = "marketplace_account_id") {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(accountColumn, accountId);
  if (error) return { table, count: null, error: error.message };
  return { table, count: count ?? 0, error: null };
}

async function countAllAccounts(client, table) {
  const { data, error } = await client.from(table).select("marketplace_account_id");
  if (error) return { error: error.message, byAccount: {} };
  const byAccount = {};
  for (const row of data ?? []) {
    const id = String(row.marketplace_account_id);
    byAccount[id] = (byAccount[id] ?? 0) + 1;
  }
  return { byAccount };
}

async function main() {
  const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
  const { resolveScopedDateRange } = await import("../src/lib/marketplace-scope.ts");
  const { getDashboardData } = await import("../src/services/dashboard-service.ts");
  const { listCompanies } = await import("../src/services/marketplace-account-service.ts");

  const client = createAdminClient();
  const tables = [
    "products",
    "product_variants",
    "wb_orders",
    "wb_sales",
    "wb_finance",
    "wb_stock",
  ];

  console.log(`=== Marketplace account data audit (account_id=${accountId}) ===\n`);

  const companies = await listCompanies();
  for (const company of companies) {
    for (const account of company.accounts) {
      console.log(
        `Account ${account.id}: ${account.account_name} (${account.marketplace}) company=${company.name} last_sync=${account.last_sync_at ?? "never"} status=${account.last_sync_status ?? "—"}`
      );
    }
  }
  console.log("");

  const counts = [];
  for (const table of tables) {
    counts.push(await countTable(client, table));
  }

  console.log(`Row counts for marketplace_account_id=${accountId}:`);
  for (const row of counts) {
    console.log(`  ${row.table}: ${row.error ? `ERROR ${row.error}` : row.count}`);
  }
  console.log("");

  console.log("Row counts across all accounts:");
  for (const table of tables) {
    const { byAccount, error } = await countAllAccounts(client, table);
    if (error) {
      console.log(`  ${table}: ERROR ${error}`);
    } else {
      console.log(`  ${table}: ${JSON.stringify(byAccount)}`);
    }
  }
  console.log("");

  // Wrong-account rows: any rows with mismatched account on joined data
  const { data: orphanSales } = await client
    .from("wb_sales")
    .select("id, marketplace_account_id, product_id, products!inner(marketplace_account_id)")
    .eq("marketplace_account_id", accountId)
    .limit(5);

  let salesProductMismatch = 0;
  for (const row of orphanSales ?? []) {
    const productAccount = String(row.products?.marketplace_account_id ?? "");
    if (productAccount && productAccount !== accountId) salesProductMismatch += 1;
  }
  console.log(`Sales/product marketplace_account_id mismatches (sample): ${salesProductMismatch}`);

  const scopeDefault = await resolveScopedDateRange({ account: "1" });
  const scopeAccount2 = await resolveScopedDateRange({ account: accountId });

  console.log("\nDashboard scope resolution:");
  console.log(`  ?account=1 -> marketplaceAccountId=${scopeDefault.marketplaceAccountId}`);
  console.log(`  ?account=${accountId} -> marketplaceAccountId=${scopeAccount2.marketplaceAccountId}`);

  const dash1 = await getDashboardData(scopeDefault);
  const dash2 = await getDashboardData(scopeAccount2);

  console.log("\nDashboard sample-data flags:");
  console.log(`  account 1: isSampleData=${dash1.isSampleData} message=${dash1.message ?? "—"}`);
  console.log(
    `  account ${accountId}: isSampleData=${dash2.isSampleData} message=${dash2.message ?? "—"}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
