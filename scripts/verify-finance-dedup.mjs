#!/usr/bin/env node
/**
 * Verify wb_finance deduplication and profitability totals.
 * Usage: node scripts/verify-finance-dedup.mjs [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

async function fetchAllInDateRange(client, table, column, from, to) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .gte(column, from)
      .lte(column, to)
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function sumLogistics(finance) {
  return finance
    .filter((row) => row.operation_type === "logistics")
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

async function main() {
  loadEnv();
  const from = process.argv[2] ?? "2026-05-24";
  const to = process.argv[3] ?? "2026-06-23";

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  const finance = await fetchAllInDateRange(client, "wb_finance", "operation_date", from, to);

  const bySourceKey = new Map();
  const byDescription = new Map();

  for (const row of finance) {
    const key = row.source_key ?? row.description;
    if (key) {
      bySourceKey.set(key, (bySourceKey.get(key) ?? 0) + 1);
    }
    if (row.description) {
      byDescription.set(row.description, (byDescription.get(row.description) ?? 0) + 1);
    }
  }

  const duplicateSourceKeys = [...bySourceKey.entries()].filter(([, count]) => count > 1);
  const duplicateDescriptions = [...byDescription.entries()].filter(([, count]) => count > 1);

  const example = duplicateSourceKeys.find(([key]) => key.includes("3127153918181")) ??
    duplicateDescriptions.find(([key]) => key.includes("3127153918181"));

  const logisticsTotal = sumLogistics(finance);

  const completedSales = await fetchAllInDateRange(client, "wb_sales", "sale_date", from, to);
  const revenue = completedSales
    .filter((row) => !row.is_return)
    .reduce((sum, row) => sum + Number(row.revenue), 0);

  const financeDeductions = finance.reduce(
    (sum, row) => sum + Math.abs(Number(row.amount)),
    0
  );

  console.log("Finance dedup verification");
  console.log("==========================");
  console.log(`Range: ${from} → ${to}`);
  console.log(`Finance rows: ${finance.length}`);
  console.log(`Duplicate source_key/description keys: ${duplicateSourceKeys.length}`);
  console.log(`Logistics total: ${logisticsTotal.toFixed(2)}`);
  console.log(`All finance deductions: ${financeDeductions.toFixed(2)}`);
  console.log(`Revenue (non-returns): ${revenue.toFixed(2)}`);
  console.log(`Net profit (revenue - all finance, no COGS/ads): ${(revenue - financeDeductions).toFixed(2)}`);

  if (example) {
    console.log(`\nExample duplicate: ${example[0]} (${example[1]} copies)`);
  }

  if (duplicateSourceKeys.length > 0) {
    console.log("\nTop duplicate keys:");
    duplicateSourceKeys
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([key, count]) => console.log(`  ${key}: ${count}x`));
    process.exitCode = 1;
  } else {
    console.log("\nOK: No duplicate source_key values in range.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
