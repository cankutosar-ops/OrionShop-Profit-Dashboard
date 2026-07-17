#!/usr/bin/env node
/**
 * Read-only Revenue Source Proof — Account 1, Portal window Jun 15–Jul 11 2026.
 * Usage: node scripts/revenue-source-proof-account1.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ACCOUNT = "1";
const FROM = "2026-06-15";
const TO = "2026-07-11";

const PORTAL = {
  ordersValue: 858_438.99,
  earningsSales: 858_438.94,
  purchasesCount: 151,
};

function loadJson(rel) {
  const p = resolve(rel);
  if (!existsSync(p)) return null;
  const raw = JSON.parse(readFileSync(p, "utf8"));
  return Array.isArray(raw) ? raw : raw.data ?? [];
}

function ymd(s) {
  return s?.slice?.(0, 10) ?? null;
}

function inRange(d) {
  return d && d >= FROM && d <= TO;
}

function sum(arr, fn) {
  return Math.round(arr.reduce((a, x) => a + fn(x), 0) * 100) / 100;
}

function pctDiff(computed, expected) {
  if (!expected) return null;
  return Math.round(((computed - expected) / expected) * 10000) / 100;
}

function diff(computed, expected) {
  return Math.round((computed - expected) * 100) / 100;
}

// --- Load exports (Account 1 — prefer full portal-proof fetch) ---
const proofDir = "exports/wb-raw-account1-portal-proof";
const legacyDir = "exports/wb-raw-2026-06-18_2026-06-29";

const ordersPrimary = loadJson(`${proofDir}/orders.json`) ?? loadJson(`${legacyDir}/orders.json`) ?? [];
const salesPrimary = loadJson(`${proofDir}/sales.json`) ?? loadJson(`${legacyDir}/sales.json`) ?? [];
const financeAll = loadJson(`${proofDir}/finance.json`) ?? loadJson(`${legacyDir}/finance.json`) ?? [];
const dailyReports = loadJson(`${proofDir}/sales-reports-list-daily.json`) ?? loadJson(`${legacyDir}/sales-reports-list-daily.json`) ?? [];

const ordersAll = ordersPrimary;
const salesAll = salesPrimary;

// Dedupe orders by gNumber+nmId+date or srid if present
const orderMap = new Map();
for (const o of ordersAll) {
  const key = o.srid ?? `${o.gNumber}|${o.nmId}|${ymd(o.date)}|${o.isCancel}`;
  orderMap.set(key, o);
}
const orders = [...orderMap.values()];

// Dedupe sales by srid/saleID
const saleMap = new Map();
for (const s of salesAll) {
  const id = s.srid ?? s.saleID;
  if (id) saleMap.set(id, s);
}
const sales = [...saleMap.values()];

// --- A. Orders API ---
const ordersInRange = orders.filter((o) => inRange(ymd(o.date)));
const ordersCancelled = ordersInRange.filter((o) => o.isCancel);
const ordersActive = ordersInRange.filter((o) => !o.isCancel);

const ordersMetrics = {
  totalOrders: ordersInRange.length,
  cancelledOrders: ordersCancelled.length,
  nonCancelledOrders: ordersActive.length,
  sum_totalPrice_all: sum(ordersInRange, (o) => o.totalPrice ?? 0),
  sum_priceWithDisc_all: sum(ordersInRange, (o) => o.priceWithDisc ?? 0),
  sum_finishedPrice_all: sum(ordersInRange, (o) => o.finishedPrice ?? 0),
  sum_totalPrice_active: sum(ordersActive, (o) => o.totalPrice ?? 0),
  sum_priceWithDisc_active: sum(ordersActive, (o) => o.priceWithDisc ?? 0),
  sum_totalPrice_cancelled: sum(ordersCancelled, (o) => o.totalPrice ?? 0),
};

// --- B. Sales API (completed sales = non-return rows) ---
const salesInRange = sales.filter((s) => inRange(ymd(s.date)));
const purchases = salesInRange.filter((s) => !String(s.saleID ?? "").startsWith("R"));
const returns = salesInRange.filter((s) => String(s.saleID ?? "").startsWith("R"));

const salesMetrics = {
  completedSalesCount: purchases.length,
  returnsCount: returns.length,
  sum_finishedPrice: sum(purchases, (s) => Math.abs(s.finishedPrice ?? 0)),
  sum_forPay: sum(purchases, (s) => Math.abs(s.forPay ?? 0)),
  sum_priceWithDisc: sum(purchases, (s) => Math.abs(s.priceWithDisc ?? 0)),
  sum_totalPrice: sum(purchases, (s) => Math.abs(s.totalPrice ?? 0)),
  sum_finishedPrice_net:
    sum(purchases, (s) => Math.abs(s.finishedPrice ?? 0)) -
    sum(returns, (s) => Math.abs(s.finishedPrice ?? 0)),
  sum_forPay_net:
    sum(purchases, (s) => Math.abs(s.forPay ?? 0)) - sum(returns, (s) => Math.abs(s.forPay ?? 0)),
};

// --- C. Finance API ---
// Filter by rr_dt (wallet posting date — portal balance axis)
const financeRr = financeAll.filter((r) => inRange(ymd(r.rr_dt)));
const financeSale = financeRr.filter((r) => r.supplier_oper_name === "Продажа");
const financeReturn = financeRr.filter((r) => r.supplier_oper_name === "Возврат");

const financeMetrics_rr = {
  rows: financeRr.length,
  sum_retail_amount_sales: sum(financeSale, (r) => Math.abs(r.retail_amount ?? 0)),
  sum_retail_amount_returns: sum(financeReturn, (r) => Math.abs(r.retail_amount ?? 0)),
  net_retail_amount:
    sum(financeSale, (r) => r.retail_amount ?? 0) + sum(financeReturn, (r) => r.retail_amount ?? 0),
  sum_ppvz_for_pay_all: sum(financeRr, (r) => r.ppvz_for_pay ?? 0),
  sum_ppvz_for_pay_sales: sum(financeSale, (r) => r.ppvz_for_pay ?? 0),
};

// Also sale_dt axis for comparison
const financeSaleDt = financeAll.filter((r) => inRange(ymd(r.sale_dt)));
const financeSaleDtSale = financeSaleDt.filter((r) => r.supplier_oper_name === "Продажа");
const financeSaleDtReturn = financeSaleDt.filter((r) => r.supplier_oper_name === "Возврат");
const financeMetrics_sale_dt = {
  net_retail_amount:
    sum(financeSaleDtSale, (r) => r.retail_amount ?? 0) +
    sum(financeSaleDtReturn, (r) => r.retail_amount ?? 0),
  sum_ppvz_for_pay_sales: sum(financeSaleDtSale, (r) => r.ppvz_for_pay ?? 0),
};

// Finance API date coverage
const financeDates = financeAll.map((r) => ymd(r.rr_dt)).filter(Boolean).sort();

// --- D. Finance API v1 daily report summaries ---
const dailyInRange = dailyReports.filter((r) => inRange(r.dateFrom));
const dailyType1 = dailyInRange.filter((r) => r.reportType === 1);
const dailyMetrics = {
  reportType1_retailAmountSum: sum(dailyType1, (r) => parseFloat(r.retailAmountSum) || 0),
  reportType1_forPaySum: sum(dailyType1, (r) => parseFloat(r.forPaySum) || 0),
  allTypes_retailAmountSum: sum(dailyInRange, (r) => parseFloat(r.retailAmountSum) || 0),
};

// --- Comparison table ---
const portalRef = PORTAL.earningsSales; // Purchases Value and Sales differ by 0.05₽ — use Sales
const candidates = [
  { label: "Portal Orders Value (Purchases tab)", value: PORTAL.ordersValue },
  { label: "Portal Earnings Sales", value: PORTAL.earningsSales },
  { label: "Orders.totalPrice (all)", value: ordersMetrics.sum_totalPrice_all },
  { label: "Orders.priceWithDisc (all)", value: ordersMetrics.sum_priceWithDisc_all },
  { label: "Orders.finishedPrice (all)", value: ordersMetrics.sum_finishedPrice_all },
  { label: "Orders.totalPrice (non-cancelled)", value: ordersMetrics.sum_totalPrice_active },
  { label: "Orders.priceWithDisc (non-cancelled)", value: ordersMetrics.sum_priceWithDisc_active },
  { label: "Sales.finishedPrice (purchases)", value: salesMetrics.sum_finishedPrice },
  { label: "Sales.forPay (purchases)", value: salesMetrics.sum_forPay },
  { label: "Sales.priceWithDisc (purchases)", value: salesMetrics.sum_priceWithDisc },
  { label: "Sales.totalPrice (purchases)", value: salesMetrics.sum_totalPrice },
  { label: "Sales.finishedPrice (net)", value: salesMetrics.sum_finishedPrice_net },
  { label: "Sales.forPay (net)", value: salesMetrics.sum_forPay_net },
  { label: "Finance.retail_amount sales (rr_dt)", value: financeMetrics_rr.sum_retail_amount_sales },
  { label: "Finance.retail_amount net (rr_dt)", value: financeMetrics_rr.net_retail_amount },
  { label: "Finance.ppvz_for_pay sales (rr_dt)", value: financeMetrics_rr.sum_ppvz_for_pay_sales },
  { label: "Finance.ppvz_for_pay all rows (rr_dt)", value: financeMetrics_rr.sum_ppvz_for_pay_all },
  { label: "Finance.retail_amount net (sale_dt)", value: financeMetrics_sale_dt.net_retail_amount },
  { label: "Finance.ppvz_for_pay sales (sale_dt)", value: financeMetrics_sale_dt.sum_ppvz_for_pay_sales },
  { label: "Finance v1 daily retailAmountSum (reportType=1)", value: dailyMetrics.reportType1_retailAmountSum },
  { label: "Finance v1 daily forPaySum (reportType=1)", value: dailyMetrics.reportType1_forPaySum },
];

const table = candidates.map((c) => ({
  metric: c.label,
  computed: c.value,
  portalRef,
  diffFromPortal: c.label.startsWith("Portal") ? 0 : diff(c.value, portalRef),
  pctDiff: c.label.startsWith("Portal") ? 0 : pctDiff(c.value, portalRef),
  exact: c.label.startsWith("Portal") ? true : Math.abs(diff(c.value, portalRef)) < 0.02,
}));

const proven = table.filter((r) => r.exact && !r.metric.startsWith("Portal"));

console.log(
  JSON.stringify(
    {
      account: ACCOUNT,
      accountName: "Wildberries Default",
      period: { from: FROM, to: TO },
      dataCoverage: {
        ordersRows: orders.length,
        ordersInRange: ordersInRange.length,
        salesRows: sales.length,
        salesInRange: salesInRange.length,
        financeRows: financeAll.length,
        financeRrDtRange: financeDates.length
          ? [financeDates[0], financeDates[financeDates.length - 1]]
          : null,
        financeFullExportPresent: existsSync(resolve(`${proofDir}/finance.json`)),
        dailyReportsInRange: dailyInRange.length,
      },
      portal: PORTAL,
      sectionA_ordersApi: ordersMetrics,
      sectionB_salesApi: salesMetrics,
      sectionC_financeApi: {
        rr_dt: financeMetrics_rr,
        sale_dt: financeMetrics_sale_dt,
        dailyReportSummaries: dailyMetrics,
      },
      comparisonTable: table,
      provenMatches: proven,
      closestNonExact: [...table]
        .filter((r) => !r.metric.startsWith("Portal"))
        .sort((a, b) => Math.abs(a.diffFromPortal) - Math.abs(b.diffFromPortal))
        .slice(0, 5),
    },
    null,
    2
  )
);
