#!/usr/bin/env node
/**
 * Product Cost dated fallback must never use another product's cost.
 *
 *   npx tsx scripts/verify-product-cost-product-scope.mjs
 */
import assert from "node:assert/strict";
import { computeProductCost, getProductCostAtDate } from "../src/lib/product-cost.ts";

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

const productACost = {
  id: "cost-a",
  product_id: "A",
  cost: 104704.51,
  effective_from: "2026-06-01",
  effective_to: null,
  created_at: "2026-06-01T00:00:00Z",
};

const sharedHistory = [productACost];

function sale(productId, overrides = {}) {
  return {
    id: "sale-1",
    marketplace_account_id: "2",
    product_id: productId,
    sale_id: "S1",
    srid: "srid",
    nm_id: 1,
    sale_date: "2026-08-16",
    revenue: 1000,
    price_with_disc: 1000,
    for_pay: 500,
    quantity: 1,
    is_return: false,
    return_date: null,
    tech_size: null,
    barcode: null,
    ...overrides,
  };
}

check("A) dated lookup returns product A's own cost", () => {
  assert.equal(getProductCostAtDate(sharedHistory, "2026-08-16", "A"), 104704.51);
});

check("B) product B with no history is unresolved zero", () => {
  assert.equal(getProductCostAtDate(sharedHistory, "2026-08-16", "B"), 0);
});

check("C) product B cannot receive product A's cost", () => {
  const costB = getProductCostAtDate(sharedHistory, "2026-08-16", "B");
  assert.notEqual(costB, productACost.cost);
  assert.equal(costB, 0);
});

check("computeProductCost does not invent cost for a SKU missing from the latest map", () => {
  const latest = new Map([["A", 10]]);
  const sales = [sale("A", { quantity: 2 }), sale("B", { id: "sale-b", quantity: 77, is_return: false })];
  assert.equal(computeProductCost(sales, sharedHistory, latest), 20);
});

check("return of a costed product still subtracts only that product's cost", () => {
  const sales = [sale("A", { is_return: true, quantity: 1 }), sale("B", { id: "sale-b" })];
  assert.equal(computeProductCost(sales, sharedHistory), -104704.51);
});

check("null product_id does not borrow another product's cost", () => {
  assert.equal(getProductCostAtDate(sharedHistory, "2026-08-16", null), 0);
});

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nproduct cost product-scope: PASS");
