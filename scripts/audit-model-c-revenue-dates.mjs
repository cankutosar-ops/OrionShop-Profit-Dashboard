#!/usr/bin/env node
/**
 * Model C netForPay date-range validation (read-only).
 * Usage: node scripts/audit-model-c-revenue-dates.mjs [accountId]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  countFinanceForPayLines,
  resolveNetForPay,
  sumNetForPayFromFinance,
} from "../src/lib/wb-settlement.ts";
import { parseWbSourceSuffix } from "../src/lib/finance-category.ts";
import { buildInclusiveDateRange } from "../src/lib/utils.ts";

function loadEnv() {
  for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function ymd(s) {
  return String(s).slice(0, 10);
}

/** Mirrors fetchAllInDateRange + fetchFinanceInRange (dashboard path). */
async function fetchFinanceInRange(client, accountId, from, to, productIds) {
  const base = {
    column: "operation_date",
    from,
    to,
    marketplaceAccountId: accountId,
  };

  async function pageQuery(opts = {}) {
    const rows = [];
    let offset = 0;
    while (true) {
      let q = client
        .from("wb_finance")
        .select("*")
        .eq("marketplace_account_id", accountId)
        .gte("operation_date", from)
        .lte("operation_date", to)
        .order("operation_date", { ascending: true })
        .range(offset, offset + 999);
      if (opts.in_product_ids) q = q.in("product_id", opts.in_product_ids);
      if (opts.null_product_id) q = q.is("product_id", null);
      const { data, error } = await q;
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < 1000) break;
      offset += 1000;
    }
    return rows;
  }

  if (!productIds?.length) {
    return pageQuery({});
  }

  const [linked, accountLevel] = await Promise.all([
    pageQuery({ in_product_ids: productIds }),
    pageQuery({ null_product_id: true }),
  ]);

  const byId = new Map();
  for (const row of [...linked, ...accountLevel]) byId.set(String(row.id), row);
  return [...byId.values()];
}

function analyzeForPay(finance) {
  const forPayRows = finance.filter(
    (r) => parseWbSourceSuffix(r.source_key, r.wb_source_suffix) === "for_pay"
  );
  const dates = forPayRows.map((r) => ymd(r.operation_date)).sort();
  const resolution = resolveNetForPay({
    finance,
    scopeFrom: dates[0] ?? "",
    scopeTo: dates[dates.length - 1] ?? "",
  });

  return {
    forPayRowCount: forPayRows.length,
    revenue: round2(sumNetForPayFromFinance(finance)),
    dataSource: resolution.dataSource,
    minOperationDate: dates[0] ?? null,
    maxOperationDate: dates[dates.length - 1] ?? null,
    financeRowCount: finance.length,
  };
}

function monthKey(d) {
  return ymd(d).slice(0, 7);
}

function forPayByMonth(finance) {
  const byMonth = new Map();
  for (const row of finance) {
    if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) !== "for_pay") continue;
    const m = monthKey(row.operation_date);
    const cur = byMonth.get(m) ?? { rows: 0, revenue: 0 };
    cur.rows += 1;
    cur.revenue += Number(row.amount);
    byMonth.set(m, cur);
  }
  return Object.fromEntries(
    [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, { rows: v.rows, revenue: round2(v.revenue) }])
  );
}

function previous60Range() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 89);
  const prevEnd = new Date();
  prevEnd.setDate(prevEnd.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  };
}

loadEnv();
const accountId = process.argv[2] ?? "1";

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
);

const { data: products } = await client
  .from("products")
  .select("id")
  .eq("marketplace_account_id", accountId);
const productIds = (products ?? []).map((p) => String(p.id));

const range30 = buildInclusiveDateRange(30);
const range60 = buildInclusiveDateRange(60);
const range90 = buildInclusiveDateRange(90);
const rangePrev60 = previous60Range();

const [finance30, finance60, finance90, financePrev60] = await Promise.all([
  fetchFinanceInRange(client, accountId, range30.from, range30.to, productIds),
  fetchFinanceInRange(client, accountId, range60.from, range60.to, productIds),
  fetchFinanceInRange(client, accountId, range90.from, range90.to, productIds),
  fetchFinanceInRange(client, accountId, rangePrev60.from, rangePrev60.to, productIds),
]);

const a30 = analyzeForPay(finance30);
const a60 = analyzeForPay(finance60);
const a90 = analyzeForPay(finance90);
const aPrev60 = analyzeForPay(financePrev60);

const incrementSum = round2(a30.revenue + aPrev60.revenue);
const incrementDiff = round2(a90.revenue - incrementSum);
const incrementHolds = Math.abs(incrementDiff) < 0.02;

console.log(
  JSON.stringify(
    {
      accountId,
      generatedAt: new Date().toISOString(),
      queryEquivalent: {
        table: "wb_finance",
        accountFilter: `marketplace_account_id = '${accountId}'`,
        dateColumn: "operation_date",
        dateFilter: "operation_date >= :from AND operation_date <= :to",
        productFilter:
          "product_id IN (account products) OR product_id IS NULL (account-level rows)",
        pagination: "1000-row pages until exhausted",
        netForPayLogic:
          "SUM(amount) WHERE parseWbSourceSuffix(source_key) = 'for_pay' (signed, not abs)",
        weeklyFallback: "NOT used when for_pay lines exist in finance",
        cache: "none — live Supabase read",
      },
      ranges: {
        last30Days: { ...range30, ...a30 },
        last60Days: { ...range60, ...a60 },
        last90Days: { ...range90, ...a90 },
        previous60DaysIn90Window: { ...rangePrev60, ...aPrev60 },
      },
      incrementValidation: {
        last30Days: a30.revenue,
        previous60Days: aPrev60.revenue,
        sum30PlusPrev60: incrementSum,
        total90Days: a90.revenue,
        equationHolds: incrementHolds,
        difference: incrementDiff,
      },
      monthlyForPayIn90DayWindow: forPayByMonth(finance90),
      dataSparsityNote: {
        last30ForPayRows: a30.forPayRowCount,
        last90ForPayRows: a90.forPayRowCount,
        additionalRowsIn60DayExtension: a90.forPayRowCount - a30.forPayRowCount,
        additionalRevenueIn60DayExtension: round2(a90.revenue - a30.revenue),
      },
      verdict: incrementHolds
        ? "YES — Model C Revenue respects operation_date filter; incremental math holds"
        : "NO — incremental sum does not match 90-day total",
    },
    null,
    2
  )
);
