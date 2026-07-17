#!/usr/bin/env node
/**
 * Prove Portal widget field mappings from raw exports + optional Supabase.
 * Usage: node scripts/_portal-field-proof.mjs [accountId] [from] [to]
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const ACCOUNT = process.argv[2] ?? "2";
const FROM = process.argv[3] ?? "2026-06-15";
const TO = process.argv[4] ?? "2026-07-11";

const PORTAL = {
  purchasesCount: 151,
  purchasesValue: 858_438.99,
  earningsSales: 858_438.94,
  earningsExpenses: -657_188.24,
  wbFee: -303_460.37,
  logistics: -267_364.29,
  storage: -11_323.58,
  penalties: -40,
  deductions: -75_000,
  dashboardRevenue: 575_860,
  dashboardPurchasesCount: 178,
  dashboardOrdersTotal: 866,
  dashboardOrdersActive: 230,
};

function ymd(s) {
  return s?.slice?.(0, 10) ?? null;
}

function inRange(d, from, to) {
  return d && d >= from && d <= to;
}

function sum(arr, fn) {
  return Math.round(arr.reduce((a, x) => a + fn(x), 0) * 100) / 100;
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(raw) ? raw : raw.data ?? [];
}

function parseCsvBalance(path, from, to) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").trim().split("\n").slice(1);
  const rows = [];
  for (const line of lines) {
    const p = line.split(",");
    const [m, d, y] = p[0].split("/");
    if (!m || !d || !y) continue;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!inRange(iso, from, to)) continue;
    rows.push({
      date: iso,
      sales: Number(p[1]) || 0,
      wbFee: Number(p[2]) || 0,
      logistics: Number(p[3]) || 0,
      storage: Number(p[4]) || 0,
      wbFeeAdj: Number(p[5]) || 0,
      penalties: Number(p[6]) || 0,
      acceptance: Number(p[7]) || 0,
      deductions: Number(p[8]) || 0,
      total: Number(p[10]) || 0,
    });
  }
  return rows;
}

function compare(label, computed, expected) {
  const diff = Math.round((computed - expected) * 100) / 100;
  return {
    label,
    computed,
    expected,
    diff,
    exact: Math.abs(diff) < 0.02,
    pctDiff: expected ? Math.round((diff / expected) * 10000) / 100 : null,
  };
}

// --- Load exports ---
const salesJun = loadJson("exports/wb-raw-2026-06-18_2026-06-29/sales.json") ?? [];
const salesJul = loadJson("exports/wb-raw-2026-06-30_2026-07-05/sales.json") ?? [];
const ordersJul = loadJson("exports/wb-raw-2026-06-30_2026-07-05/orders.json") ?? [];
const financeJun = loadJson("exports/wb-raw-2026-06-18_2026-06-29/finance.json") ?? [];

const salesAll = [...salesJun, ...salesJul];
const byId = new Map();
for (const s of salesAll) {
  const id = s.srid ?? s.saleID;
  if (id) byId.set(id, s);
}
const sales = [...byId.values()];

const salesInRange = sales.filter((s) => inRange(ymd(s.date), FROM, TO));
const purchases = salesInRange.filter((s) => !String(s.saleID ?? "").startsWith("R"));
const returns = salesInRange.filter((s) => String(s.saleID ?? "").startsWith("R"));

const ordersInRange = ordersJul.filter((s) => inRange(ymd(s.date), FROM, TO));

// Finance rows
const financeInRange = financeJun.filter((r) => {
  const d = ymd(r.rr_dt ?? r.sale_dt ?? r.order_dt);
  return inRange(d, FROM, TO);
});

const financeSaleRows = financeInRange.filter((r) => r.supplier_oper_name === "Продажа");
const financeReturnRows = financeInRange.filter((r) => r.supplier_oper_name === "Возврат");

const csvRows = parseCsvBalance("c:/Users/User/Downloads/New balance details.csv", FROM, TO);

// --- Supabase optional ---
async function fetchDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const h = { apikey: key, Authorization: `Bearer ${key}` };
  async function all(table, col) {
    const rows = [];
    let offset = 0;
    while (true) {
      const r = await fetch(
        `${url}/rest/v1/${table}?select=*&marketplace_account_id=eq.${ACCOUNT}&${col}=gte.${FROM}&${col}=lte.${TO}&offset=${offset}&limit=1000`,
        { headers: h }
      );
      const batch = await r.json();
      if (!Array.isArray(batch) || !batch.length) break;
      rows.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    return rows;
  }
  const [dbSales, dbOrders, dbFinance] = await Promise.all([
    all("wb_sales", "sale_date"),
    all("wb_orders", "order_date"),
    all("wb_finance", "operation_date"),
  ]);
  return { dbSales, dbOrders, dbFinance };
}

const db = await fetchDb().catch(() => null);

const results = {
  period: { from: FROM, to: TO, account: ACCOUNT },
  portal: PORTAL,
  salesApi: {
    count_purchases: purchases.length,
    count_returns: returns.length,
    count_all: salesInRange.length,
    sum_finishedPrice_purchases: sum(purchases, (s) => Math.abs(s.finishedPrice ?? 0)),
    sum_forPay_purchases: sum(purchases, (s) => Math.abs(s.forPay ?? 0)),
    sum_priceWithDisc_purchases: sum(purchases, (s) => Math.abs(s.priceWithDisc ?? 0)),
    sum_totalPrice_purchases: sum(purchases, (s) => Math.abs(s.totalPrice ?? 0)),
    sum_finishedPrice_all: sum(salesInRange, (s) => Math.abs(s.finishedPrice ?? s.forPay ?? 0)),
    sum_finishedPrice_net: sum(purchases, (s) => Math.abs(s.finishedPrice ?? 0)) -
      sum(returns, (s) => Math.abs(s.finishedPrice ?? 0)),
  },
  ordersApi: {
    count_all: ordersInRange.length,
    count_active: ordersInRange.filter((o) => !o.isCancel).length,
    count_cancelled: ordersInRange.filter((o) => o.isCancel).length,
    sum_totalPrice_all: sum(ordersInRange, (o) => o.totalPrice ?? 0),
    sum_priceWithDisc_all: sum(ordersInRange, (o) => o.priceWithDisc ?? 0),
  },
  financeApi_rr_dt: {
    retail_amount_sales: sum(financeSaleRows, (r) => Math.abs(r.retail_amount ?? 0)),
    retail_amount_returns: sum(financeReturnRows, (r) => Math.abs(r.retail_amount ?? 0)),
    retail_amount_net:
      sum(financeSaleRows, (r) => r.retail_amount ?? 0) +
      sum(financeReturnRows, (r) => r.retail_amount ?? 0),
    commission: sum(financeInRange, (r) => r.ppvz_sales_commission ?? 0),
    logistics: sum(financeInRange, (r) => Math.abs(r.delivery_rub ?? 0)),
    storage: sum(financeInRange, (r) => Math.abs(r.storage_fee ?? 0)),
    penalties: sum(financeInRange, (r) => Math.abs(r.penalty ?? 0)),
    deductions: sum(financeInRange, (r) => Math.abs(r.deduction ?? 0)),
  },
  financeApi_sale_dt: (() => {
    const rows = financeJun.filter((r) => inRange(ymd(r.sale_dt), FROM, TO));
    const sale = rows.filter((r) => r.supplier_oper_name === "Продажа");
    const ret = rows.filter((r) => r.supplier_oper_name === "Возврат");
    return {
      retail_amount_net:
        sum(sale, (r) => r.retail_amount ?? 0) + sum(ret, (r) => r.retail_amount ?? 0),
      commission: sum(rows, (r) => r.ppvz_sales_commission ?? 0),
      logistics: sum(rows, (r) => Math.abs(r.delivery_rub ?? 0)),
    };
  })(),
  balanceCsv: csvRows
    ? {
        days: csvRows.length,
        sales: sum(csvRows, (r) => r.sales),
        wbFee: sum(csvRows, (r) => r.wbFee),
        logistics: sum(csvRows, (r) => r.logistics),
        storage: sum(csvRows, (r) => r.storage),
        penalties: sum(csvRows, (r) => r.penalties),
        deductions: sum(csvRows, (r) => r.deductions),
        total: sum(csvRows, (r) => r.total),
      }
    : null,
};

if (db) {
  const dbPurchases = db.dbSales.filter((s) => !s.is_return);
  const dbReturns = db.dbSales.filter((s) => s.is_return);
  results.database = {
    purchases_count: dbPurchases.length,
    returns_count: dbReturns.length,
    revenue_finishedPrice: sum(dbPurchases, (s) => Number(s.revenue)),
    orders_count_all: db.dbOrders.reduce((a, o) => a + Number(o.quantity ?? 1), 0),
    orders_count_active: db.dbOrders
      .filter((o) => o.status === "active")
      .reduce((a, o) => a + Number(o.quantity ?? 1), 0),
    finance_commission: sum(db.dbFinance.filter((r) => r.wb_source_suffix === "commission"), (r) =>
      Number(r.amount)
    ),
    finance_logistics: sum(
      db.dbFinance.filter((r) => ["logistics", "return_logistics"].includes(r.wb_source_suffix)),
      (r) => Number(r.amount)
    ),
    finance_storage: sum(db.dbFinance.filter((r) => r.wb_source_suffix === "storage"), (r) =>
      Number(r.amount)
    ),
  };
}

const portalMatches = [
  compare("Portal Purchases Value vs Sales API finishedPrice (sale_date)", results.salesApi.sum_finishedPrice_purchases, PORTAL.purchasesValue),
  compare("Portal Purchases Value vs Sales API forPay (sale_date)", results.salesApi.sum_forPay_purchases, PORTAL.purchasesValue),
  compare("Portal Purchases Value vs Sales API priceWithDisc (sale_date)", results.salesApi.sum_priceWithDisc_purchases, PORTAL.purchasesValue),
  compare("Portal Purchases Value vs Finance retail_amount net (rr_dt)", results.financeApi_rr_dt.retail_amount_net, PORTAL.purchasesValue),
  compare("Portal Purchases Value vs Finance retail_amount net (sale_dt)", results.financeApi_sale_dt.retail_amount_net, PORTAL.purchasesValue),
  compare("Portal Purchases Value vs Balance CSV Sales sum", results.balanceCsv?.sales ?? 0, PORTAL.purchasesValue),
  compare("Portal Earnings Sales vs Balance CSV Sales", results.balanceCsv?.sales ?? 0, PORTAL.earningsSales),
  compare("Portal Purchases Count vs Sales API purchases (sale_date)", results.salesApi.count_purchases, PORTAL.purchasesCount),
  compare("Portal Purchases Count vs DB purchases", results.database?.purchases_count ?? 0, PORTAL.purchasesCount),
  compare("Dashboard Revenue vs DB revenue", results.database?.revenue_finishedPrice ?? 0, PORTAL.dashboardRevenue),
  compare("Portal WB fee vs Balance CSV", results.balanceCsv?.wbFee ?? 0, PORTAL.wbFee),
  compare("Portal Logistics vs Balance CSV", results.balanceCsv?.logistics ?? 0, PORTAL.logistics),
  compare("Portal Storage vs Balance CSV", results.balanceCsv?.storage ?? 0, PORTAL.storage),
  compare("Portal Deductions vs Balance CSV", results.balanceCsv?.deductions ?? 0, PORTAL.deductions),
  compare("Portal Expenses vs CSV sum of expense cols", results.balanceCsv ? results.balanceCsv.wbFee + results.balanceCsv.logistics + results.balanceCsv.storage + results.balanceCsv.penalties + results.balanceCsv.deductions : 0, PORTAL.earningsExpenses),
];

results.portalMatches = portalMatches;
results.proven = portalMatches.filter((m) => m.exact);
results.closest = [...portalMatches].sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff)).slice(0, 8);

console.log(JSON.stringify(results, null, 2));
