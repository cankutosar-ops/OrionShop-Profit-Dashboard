#!/usr/bin/env node
/**
 * Sales event identity regression tests (no database writes).
 *
 *   npx tsx scripts/verify-sales-event-identity.mjs
 */
import assert from "node:assert/strict";
import { mapApiSaleToDb } from "../src/lib/wildberries/mappers.ts";
import {
  dedupeSalesEvents,
  saleEventMayUpdate,
  salesEventKey,
} from "../src/lib/wildberries/sales-event-identity.ts";
import { computeProductCost } from "../src/lib/product-cost.ts";
import {
  buildNetFinishedPriceFromDb,
  buildNetSalesFromDb,
} from "../src/lib/sales-revenue-resolution.ts";
import { calculateEstimatedTax } from "../src/lib/financial-engine-tax.ts";
import { buildSridToProductIdMap } from "../src/lib/product-logistics-attribution.ts";

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${name} — ${err instanceof Error ? err.message : err}`);
  }
}

function apiSale(overrides) {
  return {
    date: "2026-08-03T10:00:00",
    lastChangeDate: "2026-08-03T10:00:00",
    supplierArticle: "SKU",
    totalPrice: 1000,
    saleID: "S1",
    forPay: 500,
    finishedPrice: 800,
    priceWithDisc: 900,
    nmId: 1,
    srid: "SRID-X",
    ...overrides,
  };
}

function event(overrides) {
  return {
    marketplace_account_id: "2",
    sale_id: "S1",
    event_type: "SALE",
    srid: "SRID-X",
    nm_id: 1,
    product_id: "p1",
    sale_date: "2026-08-03",
    revenue: 800,
    price_with_disc: 900,
    for_pay: 500,
    quantity: 1,
    is_return: false,
    return_date: null,
    ...overrides,
  };
}

check("TEST 1 — SALE maps to one SALE event", () => {
  const row = mapApiSaleToDb(apiSale({}), "p1");
  assert.equal(row.event_type, "SALE");
  assert.equal(row.is_return, false);
  assert.equal(row.sale_id, "S1");
  assert.equal(row.sale_date, "2026-08-03");
  assert.equal(row.return_date, null);
  assert.equal(row.quantity, 1);
  assert.ok(row.price_with_disc > 0);
});

check("TEST 2 — RETURN coexists; SALE row is not the target", () => {
  const sale = event({});
  const ret = event({
    sale_id: "R1",
    event_type: "RETURN",
    is_return: true,
    sale_date: "2026-08-20",
    return_date: "2026-08-20",
  });
  const { rows, dropped } = dedupeSalesEvents([sale, ret]);
  assert.equal(dropped, 0);
  assert.equal(rows.length, 2);
  const saleRow = rows.find((r) => r.sale_id === "S1");
  assert.equal(saleRow.sale_date, "2026-08-03");
  assert.equal(saleEventMayUpdate(sale, ret), false);
  assert.equal(saleEventMayUpdate(sale, { ...sale, sale_date: "2026-08-03" }), true);
});

check("TEST 3 — repeating the same payload does not duplicate", () => {
  const sale = event({});
  const { rows, dropped } = dedupeSalesEvents([sale, { ...sale }, { ...sale }]);
  assert.equal(rows.length, 1);
  assert.equal(dropped, 2);
  assert.equal(salesEventKey("2", "S1"), "2\0S1");
});

check("TEST 4 — RETURN before SALE still keeps both", () => {
  const ret = event({
    sale_id: "R1",
    event_type: "RETURN",
    is_return: true,
    sale_date: "2026-08-20",
    return_date: "2026-08-20",
  });
  const sale = event({});
  const { rows } = dedupeSalesEvents([ret, sale]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.event_type === "SALE").sale_date, "2026-08-03");
  assert.equal(rows.find((r) => r.event_type === "RETURN").return_date, "2026-08-20");
});

check("TEST 5 — return date never replaces original sale_date", () => {
  const sale = mapApiSaleToDb(apiSale({ date: "2026-08-03T00:00:00", saleID: "S9" }), "p1");
  const ret = mapApiSaleToDb(
    apiSale({ date: "2026-08-20T00:00:00", saleID: "R9", srid: "SRID-X" }),
    "p1"
  );
  assert.equal(sale.sale_date, "2026-08-03");
  assert.equal(ret.sale_date, "2026-08-20");
  assert.notEqual(sale.sale_id, ret.sale_id);
  const merged = dedupeSalesEvents([
    { ...sale, marketplace_account_id: "2" },
    { ...ret, marketplace_account_id: "2" },
  ]);
  assert.equal(merged.rows.find((r) => r.sale_id === "S9").sale_date, "2026-08-03");
});

check("TEST 6 — Product Cost uses sale minus return quantities, formula unchanged", () => {
  const sales = [
    event({ quantity: 1, is_return: false }),
    event({
      sale_id: "R1",
      event_type: "RETURN",
      is_return: true,
      quantity: 1,
      sale_date: "2026-08-20",
    }),
  ];
  const latest = new Map([["p1", 100]]);
  const cost = computeProductCost(sales, [], latest);
  assert.equal(cost, 0);
  const saleOnly = computeProductCost([sales[0]], [], latest);
  assert.equal(saleOnly, 100);
});

check("TEST 7 — Net Sales uses priceWithDisc purchases minus returns", () => {
  const sales = [
    event({ price_with_disc: 900, is_return: false }),
    event({
      sale_id: "R1",
      is_return: true,
      price_with_disc: 900,
      sale_date: "2026-08-20",
    }),
  ];
  const net = buildNetSalesFromDb(sales);
  assert.equal(net.grossSales, 900);
  assert.equal(net.returnedSales, 900);
  assert.equal(net.netSales, 0);
});

check("TEST 8 — Estimated Tax uses finishedPrice (revenue) × 6%, not Net Sales", () => {
  const sales = [
    event({ revenue: 800, price_with_disc: 900, is_return: false }),
    event({
      sale_id: "R1",
      is_return: true,
      revenue: 200,
      price_with_disc: 250,
      sale_date: "2026-08-20",
    }),
  ];
  const base = buildNetFinishedPriceFromDb(sales);
  assert.equal(base, 600);
  assert.equal(calculateEstimatedTax(base, 6), 36);
});

check("TEST 9 — logistics SRID map prefers SALE product_id when both events exist", () => {
  const sales = [
    event({ product_id: "sale-product", is_return: false }),
    event({
      sale_id: "R1",
      is_return: true,
      product_id: "return-product",
      sale_date: "2026-08-20",
    }),
  ];
  const map = buildSridToProductIdMap(sales);
  assert.equal(map.get("SRID-X"), "sale-product");
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll sales event identity checks passed");
