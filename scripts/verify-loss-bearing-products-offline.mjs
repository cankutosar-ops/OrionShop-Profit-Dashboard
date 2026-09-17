#!/usr/bin/env node
/** Offline inclusion regression. Exercises real profitability and report projections. */
import assert from "node:assert/strict";
import { buildProductProfitabilityResult } from "../src/lib/product-profitability-builder.ts";
import {
  buildProductAnalyticsRows,
  buildProductAnalyticsTotals,
  buildProductAnalyticsV3Rows,
  verifyProductAnalyticsOperationalTotals,
  verifyProductAnalyticsTotals,
  verifyProductAnalyticsV3Totals,
} from "../src/lib/product-analytics.ts";
import { buildProductProfitReport } from "../src/lib/reporting/module/product-profit-report.ts";

const activeIds = ["return", "negative", "storage", "penalty", "adjustment", "return-logistics", "acceptance"];
const products = [...activeIds, "idle"].map((id, index) => ({
  id,
  marketplace_account_id: "account-a",
  nm_id: index + 1,
  supplier_article: `article-${id}`,
  name: `Product ${id}`,
  brand: null,
  category: null,
}));

const financeRow = (id, productId, suffix, category, operationType, amount) => ({
  id,
  marketplace_account_id: "account-a",
  product_id: productId,
  nm_id: null,
  operation_date: "2026-09-01",
  operation_type: operationType,
  finance_category: category,
  amount,
  source_key: `rrd:${id}:${suffix}`,
  srid: null,
  description: null,
});

const input = {
  products,
  orders: [],
  sales: [{
    id: "return-sale", marketplace_account_id: "account-a", product_id: "return",
    nm_id: 1, srid: "return-srid", sale_date: "2026-09-01", revenue: 90,
    price_with_disc: 100, for_pay: 80, quantity: 1, is_return: true,
    return_date: "2026-09-01",
  }],
  finance: [
    financeRow("1", "negative", "for_pay", "OTHER", "other", -40),
    financeRow("2", "storage", "storage", "STORAGE", "storage", -5),
    financeRow("3", "penalty", "penalty", "PENALTY", "penalty", -6),
    financeRow("4", "adjustment", "deduction", "ADJUSTMENT", "other", -7),
    financeRow("5", "return-logistics", "return_logistics", "RETURN_LOGISTICS", "return_logistics", -8),
    financeRow("6", "acceptance", "acceptance", "OTHER", "other", -9),
    financeRow("7", null, "storage", "STORAGE", "storage", -77),
    financeRow("8", null, "for_pay", "OTHER", "other", -30),
  ],
  ads: [],
  costHistory: [],
};

const build = buildProductProfitabilityResult(input);
const actualIds = new Set(build.rows.map((row) => row.productId));
assert.deepEqual(actualIds, new Set(activeIds));
assert.equal(build.unallocatedRevenue, -30);
assert.equal(build.accountRevenue, -70);
assert.equal(build.rows.reduce((sum, row) => sum + row.storage, 0), 5);
assert.equal(build.rows.find((row) => row.productId === "return").unitsReturned, 1);
assert.ok(build.rows.find((row) => row.productId === "return").netSales < 0);
assert.equal(build.rows.find((row) => row.productId === "negative").revenue, -40);
for (const id of ["storage", "penalty", "adjustment", "return-logistics", "acceptance"]) {
  assert.ok(build.rows.find((row) => row.productId === id).finalNetProfit < 0, id);
}
assert.ok(build.rows.every((row) => row.productId !== "idle"));

const profitReport = buildProductProfitReport({ products: build.rows });
assert.deepEqual(new Set(profitReport.rows.map((row) => row.productId)), actualIds);

const analytics = buildProductAnalyticsRows(build.rows);
const analyticsV3 = buildProductAnalyticsV3Rows(build.rows);
assert.deepEqual(new Set(analytics.map((row) => row.productId)), actualIds);
assert.deepEqual(new Set(analyticsV3.map((row) => row.productId)), actualIds);

const totals = buildProductAnalyticsTotals(build.rows, {
  unallocatedRevenue: build.unallocatedRevenue,
  accountRevenue: build.accountRevenue,
});
assert.equal(totals.productCount, activeIds.length);
assert.equal(totals.netProfit, build.rows.reduce((sum, row) => sum + row.finalNetProfit, 0));
assert.equal(totals.unallocatedRevenue, -30);
assert.equal(verifyProductAnalyticsTotals(build.rows, totals).ok, true);
assert.equal(verifyProductAnalyticsV3Totals(analyticsV3, totals).ok, true);
assert.equal(verifyProductAnalyticsOperationalTotals(analyticsV3, totals).ok, true);

console.log("PASS loss-bearing products: returns, negative revenue, expenses, unallocated isolation, reports, analytics totals");
