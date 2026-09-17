#!/usr/bin/env node
/** Offline regression for partial Sales API priceWithDisc coverage. */
import assert from "node:assert/strict";
import {
  buildNetSalesFromDb,
  netSalesNeedsApiFallback,
  resolveNetSalesFromSources,
} from "../src/lib/sales-revenue-resolution.ts";

const sale = (price_with_disc, is_return = false) => ({
  price_with_disc,
  is_return,
  quantity: 1,
});
const resolve = (sales) =>
  resolveNetSalesFromSources({
    sales,
    scopeFrom: "2026-09-01",
    scopeTo: "2026-09-07",
  });

assert.equal(resolve([]).status, "empty");
assert.equal(netSalesNeedsApiFallback([]), false);

const complete = [sale(100), sale(40, true)];
assert.equal(netSalesNeedsApiFallback(complete), false);
assert.deepEqual(resolve(complete), {
  ...buildNetSalesFromDb(complete),
  dataSource: "db",
  status: "ready",
});

for (const partial of [
  [sale(100), sale(0)],
  [sale(100), sale(0, true)],
  [sale(100), sale(null)],
]) {
  assert.equal(netSalesNeedsApiFallback(partial), true);
  assert.deepEqual(resolve(partial), {
    ...buildNetSalesFromDb(partial),
    dataSource: "db",
    status: "unavailable",
  });
}

assert.deepEqual(resolve([sale(0)]), {
  grossSales: 0,
  returnedSales: 0,
  netSales: 0,
  dataSource: "db",
  status: "unavailable",
});

console.log("PASS Sales price readiness: partial coverage is unavailable without changing observed amounts");
