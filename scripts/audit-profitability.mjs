#!/usr/bin/env node
/**
 * Replays dashboard net profit calculation for a date range.
 * Usage: node scripts/audit-profitability.mjs [from] [to]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

const FINANCE_TYPES = [
  "commission",
  "logistics",
  "return_logistics",
  "storage",
  "penalty",
  "other",
];

function loadEnv() {
  const content = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function sumByType(finance, type) {
  return finance
    .filter((row) => row.operation_type === type)
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
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

async function fetchAllRows(client, table) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client.from(table).select("*").range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function buildLatestCostByProductId(costHistory, products) {
  const latestByArticle = new Map();

  for (const entry of costHistory) {
    const product = products.find((p) => String(p.id) === String(entry.product_id));
    if (!product) continue;
    const current = latestByArticle.get(product.supplier_article);
    if (!current || entry.effective_from > current.effective_from) {
      latestByArticle.set(product.supplier_article, entry);
    }
  }

  const byProductId = new Map();
  for (const product of products) {
    const latest = latestByArticle.get(product.supplier_article);
    if (latest) byProductId.set(String(product.id), Number(latest.cost));
  }
  return byProductId;
}

async function main() {
  loadEnv();
  const defaults = getDefaultDateRange();
  const from = process.argv[2] ?? defaults.from;
  const to = process.argv[3] ?? defaults.to;

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );

  const [{ count: salesCount }, { count: financeCount }] = await Promise.all([
    client.from("wb_sales").select("*", { count: "exact", head: true }).gte("sale_date", from).lte("sale_date", to),
    client.from("wb_finance").select("*", { count: "exact", head: true }).gte("operation_date", from).lte("operation_date", to),
  ]);

  const [sales, finance, ads, costHistory, products] = await Promise.all([
    fetchAllInDateRange(client, "wb_sales", "sale_date", from, to),
    fetchAllInDateRange(client, "wb_finance", "operation_date", from, to),
    fetchAllInDateRange(client, "wb_ads", "campaign_date", from, to),
    fetchAllRows(client, "product_cost_history"),
    fetchAllRows(client, "products"),
  ]);

  const completedSales = sales.filter((row) => !row.is_return);
  const revenue = completedSales.reduce((sum, row) => sum + Number(row.revenue), 0);
  const latestCostByProductId = buildLatestCostByProductId(costHistory, products);
  const productCost = completedSales.reduce((sum, sale) => {
    const unitCost = latestCostByProductId.get(String(sale.product_id)) ?? 0;
    return sum + unitCost * Number(sale.quantity);
  }, 0);

  const byType = Object.fromEntries(FINANCE_TYPES.map((type) => [type, sumByType(finance, type)]));
  const unclassified = finance
    .filter((row) => !FINANCE_TYPES.includes(row.operation_type))
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
  const advertising = ads.reduce((sum, row) => sum + Number(row.spend), 0);

  const commission = byType.commission;
  const logistics = byType.logistics;
  const returnLogistics = byType.return_logistics;
  const storage = byType.storage;
  const penalties = byType.penalty;
  const otherExpenses = byType.other + unclassified;

  const netProfit =
    revenue -
    productCost -
    commission -
    logistics -
    returnLogistics -
    storage -
    penalties -
    otherExpenses -
    advertising;

  const totalDeductions =
    productCost +
    commission +
    logistics +
    returnLogistics +
    storage +
    penalties +
    otherExpenses +
    advertising;

  console.log("Profitability audit");
  console.log("===================");
  console.log(`Date range: sales.sale_date [${from} .. ${to}]`);
  console.log(`            finance.operation_date [${from} .. ${to}]`);
  console.log("");
  console.log(`Revenue:              ${revenue.toFixed(2)}  (${completedSales.length} of ${salesCount ?? "?"} sales)`);
  console.log(`Commission:           ${commission.toFixed(2)}`);
  console.log(`Logistics:            ${logistics.toFixed(2)}`);
  console.log(`Return Logistics:     ${returnLogistics.toFixed(2)}`);
  console.log(`Storage:              ${storage.toFixed(2)}`);
  console.log(`Penalties:            ${penalties.toFixed(2)}  (separate from Other)`);
  console.log(`Other:                ${otherExpenses.toFixed(2)}`);
  if (unclassified > 0) {
    console.log(`  (includes unclassified finance types: ${unclassified.toFixed(2)})`);
  }
  console.log(`Advertising:          ${advertising.toFixed(2)}`);
  console.log(`Product Cost:         ${productCost.toFixed(2)}`);
  console.log("----------------------------------------");
  console.log(`Net Profit:           ${netProfit.toFixed(2)}`);
  console.log("");
  console.log(`Total deductions:     ${totalDeductions.toFixed(2)}`);
  console.log(`Finance rows loaded:  ${finance.length} / ${financeCount ?? "?"} in range`);
  console.log(`Margin:               ${revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : 0}%`);
  console.log("");

  const typeCounts = {};
  const typeAmounts = {};
  for (const row of finance) {
    typeCounts[row.operation_type] = (typeCounts[row.operation_type] ?? 0) + 1;
    typeAmounts[row.operation_type] =
      (typeAmounts[row.operation_type] ?? 0) + Math.abs(Number(row.amount));
  }
  console.log("Finance operation_type amounts:", typeAmounts);
  console.log("Finance operation_type row counts:", typeCounts);

  if (unclassified > 0) {
    const unknown = [...new Set(finance.map((row) => row.operation_type).filter((t) => !FINANCE_TYPES.includes(t)))];
    console.log("Unclassified operation types:", unknown);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
