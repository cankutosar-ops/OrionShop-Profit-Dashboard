#!/usr/bin/env node
/**
 * Sprint 6.17 — validates date-range scope across DB row counts and dashboard metrics.
 * Usage: node scripts/validate-date-range.mjs [--account 1] [--port 3000]
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

function buildRange(days) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    days,
  };
}

async function countInRange(client, table, column, from, to, accountId) {
  let q = client
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, from)
    .lte(column, to);
  if (accountId) q = q.eq("marketplace_account_id", accountId);
  const { count, error } = await q;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function fetchPaginated(client, table, column, from, to, accountId) {
  const rows = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    let q = client
      .from(table)
      .select("*")
      .gte(column, from)
      .lte(column, to)
      .order(column, { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (accountId) q = q.eq("marketplace_account_id", accountId);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function sumRevenue(sales) {
  return sales.filter((s) => !s.is_return).reduce((sum, s) => sum + Number(s.revenue ?? 0), 0);
}

function sumFinanceAbs(finance) {
  return finance.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0);
}

async function probeDashboard(port, account, from, to) {
  const url = `http://localhost:${port}/?company=1&account=${account}&from=${from}&to=${to}`;
  const response = await fetch(url, { redirect: "follow" });
  const html = await response.text();
  const revenueMatch = html.match(/Revenue[\s\S]*?<p[^>]*>([^<]+)<\/p>/i);
  const ordersMatch = html.match(/Orders[\s\S]*?<p[^>]*>([\d\s]+)<\/p>/i);
  return {
    ok: response.ok,
    revenueText: revenueMatch?.[1]?.trim() ?? "n/a",
    ordersText: ordersMatch?.[1]?.trim() ?? "n/a",
  };
}

async function main() {
  loadEnv();
  const account = process.argv.includes("--account")
    ? process.argv[process.argv.indexOf("--account") + 1]
    : "1";
  const port = process.argv.includes("--port")
    ? Number(process.argv[process.argv.indexOf("--port") + 1])
    : 3000;

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const ranges = [7, 30, 90, 180].map(buildRange);

  console.log("=== Sprint 6.17 Date Range Validation ===\n");
  console.log(`Account: ${account}\n`);

  // Data extent in DB
  for (const table of ["wb_orders", "wb_sales", "wb_finance"]) {
    const col = table === "wb_orders" ? "order_date" : table === "wb_sales" ? "sale_date" : "operation_date";
    const { data } = await client
      .from(table)
      .select(col)
      .eq("marketplace_account_id", account)
      .order(col, { ascending: true })
      .limit(1);
    const { data: dataMax } = await client
      .from(table)
      .select(col)
      .eq("marketplace_account_id", account)
      .order(col, { ascending: false })
      .limit(1);
    const min = data?.[0]?.[col] ? String(data[0][col]).slice(0, 10) : "none";
    const max = dataMax?.[0]?.[col] ? String(dataMax[0][col]).slice(0, 10) : "none";
    console.log(`DB extent ${table}: ${min} → ${max}`);
  }

  console.log("\n| Range | From | To | Orders | Sales | Finance | Revenue |");
  console.log("|-------|------|-----|--------|-------|---------|---------|");

  const table = [];

  for (const range of ranges) {
    const [orders, sales, finance] = await Promise.all([
      countInRange(client, "wb_orders", "order_date", range.from, range.to, account),
      countInRange(client, "wb_sales", "sale_date", range.from, range.to, account),
      countInRange(client, "wb_finance", "operation_date", range.from, range.to, account),
    ]);
    const salesRows = await fetchPaginated(
      client,
      "wb_sales",
      "sale_date",
      range.from,
      range.to,
      account
    );
    const revenue = sumRevenue(salesRows);
    table.push({ ...range, orders, sales, finance, revenue });
    console.log(
      `| ${range.days}d | ${range.from} | ${range.to} | ${orders} | ${sales} | ${finance} | ${Math.round(revenue)} |`
    );
  }

  console.log("\n=== Effective query log (per range) ===");
  for (const row of table) {
    console.log(`\nRequested/Resolved: ${row.from} → ${row.to} (${row.days} days)`);
    console.log(`Rows returned — Orders: ${row.orders}, Sales: ${row.sales}, Finance: ${row.finance}`);
    console.log(`Computed revenue (sales, non-returns): ${Math.round(row.revenue)}`);
  }

  console.log("\n=== Dashboard HTML probe (live server) ===");
  for (const row of table) {
    try {
      const probe = await probeDashboard(port, account, row.from, row.to);
      console.log(
        `${row.days}d: HTTP ${probe.ok ? 200 : "ERR"} — Revenue card: ${probe.revenueText}, Orders card: ${probe.ordersText}`
      );
    } catch (error) {
      console.log(`${row.days}d: probe failed — ${error instanceof Error ? error.message : error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
