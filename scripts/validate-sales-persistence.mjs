#!/usr/bin/env node
/**
 * Validate sales revenue persistence for both marketplace accounts.
 * Usage: npx tsx scripts/validate-sales-persistence.mjs [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";
import {
  buildNetSalesFromDb,
  netSalesNeedsApiFallback,
  resolveNetSalesFromSources,
} from "../src/lib/sales-revenue-resolution.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

loadEnv();

const from = process.argv[2] ?? "2026-01-01";
const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const ACCOUNTS = [
  { id: "1", label: "Default Company" },
  { id: "2", label: "Orion Shop" },
];

async function validateAccount(client, account) {
  const probe = await client.from("wb_sales").select("price_with_disc, for_pay").limit(1);
  const columnsExist = !probe.error;

  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from("wb_sales")
      .select("*")
      .eq("marketplace_account_id", account.id)
      .gte("sale_date", from)
      .lte("sale_date", to)
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
    offset += 1000;
  }

  const nonReturns = rows.filter((r) => !r.is_return);
  const withDisc = nonReturns.filter((r) => Number(r.price_with_disc) > 0).length;
  const withForPay = rows.filter((r) => Number(r.for_pay) > 0).length;
  const dbResolution = resolveNetSalesFromSources({
    sales: rows,
    scopeFrom: from,
    scopeTo: to,
  });

  return {
    account: account.label,
    accountId: account.id,
    columnsExist,
    totalRows: rows.length,
    nonReturns: nonReturns.length,
    withDisc,
    withForPay,
    discPct: nonReturns.length ? Math.round((withDisc / nonReturns.length) * 100) : 0,
    forPayPct: rows.length ? Math.round((withForPay / rows.length) * 100) : 0,
    netSalesDb: buildNetSalesFromDb(rows).netSales,
    needsApiFallback: netSalesNeedsApiFallback(rows),
    dataSource: dbResolution.dataSource,
    status: dbResolution.status,
  };
}

async function main() {
  const client = createAdminClient();
  console.log("=== SALES PERSISTENCE VALIDATION ===");
  console.log(`Period: ${from} → ${to}\n`);

  for (const account of ACCOUNTS) {
    const v = await validateAccount(client, account);
    console.log(`## ${v.account} (account ${v.accountId})`);
    console.log("| Validation | Status |");
    console.log("|-----------|--------|");
    console.log(`| price_with_disc column exists | ${v.columnsExist ? "PASS" : "FAIL"} |`);
    console.log(
      `| price_with_disc populated (${v.withDisc}/${v.nonReturns} sales, ${v.discPct}%) | ${
        v.nonReturns === 0 ? "N/A (no sales)" : v.discPct >= 95 ? "PASS" : "FAIL"
      } |`
    );
    console.log(
      `| for_pay populated (${v.withForPay}/${v.totalRows} rows, ${v.forPayPct}%) | ${
        v.totalRows === 0 ? "N/A (no sales)" : v.forPayPct >= 95 ? "PASS" : "FAIL"
      } |`
    );
    console.log(
      `| Historical sales complete (${v.totalRows} rows) | ${v.totalRows > 0 ? "PASS" : "WARN — no rows"} |`
    );
    console.log(
      `| API fallback no longer used | ${!v.needsApiFallback && v.dataSource === "db" ? "PASS" : "FAIL"} |`
    );
    console.log(
      `| Model B Revenue read entirely from DB | ${
        v.netSalesDb > 0 && v.dataSource === "db" && v.status === "ready" ? "PASS" : "FAIL"
      } (netSales=${v.netSalesDb.toFixed(2)}) |`
    );
    console.log("");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
