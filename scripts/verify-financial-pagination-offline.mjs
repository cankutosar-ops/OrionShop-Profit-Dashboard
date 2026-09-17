#!/usr/bin/env node
/** Page-boundary regression for financial reads with many rows on one date. */
import assert from "node:assert/strict";
import { fetchAllInDateRange, fetchAllRows } from "../src/lib/supabase/paginate.ts";

function fakeClient(table, dateColumn, { failAtOffset = -1 } = {}) {
  const records = [
    ...Array.from({ length: 1005 }, (_, index) => ({
      id: String(index + 1).padStart(5, "0"),
      marketplace_account_id: "account-a",
      product_id: "product-a",
      [dateColumn]: "2026-09-01",
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `other-${index}`,
      marketplace_account_id: "account-b",
      product_id: "product-b",
      [dateColumn]: "2026-09-01",
    })),
  ].reverse();
  const calls = [];

  return {
    calls,
    from(actualTable) {
      assert.equal(actualTable, table);
      const predicates = [];
      const orders = [];
      let range;
      const query = {
        select() { return query; },
        gte(column, value) { predicates.push((row) => row[column] >= value); return query; },
        lte(column, value) { predicates.push((row) => row[column] <= value); return query; },
        eq(column, value) { predicates.push((row) => row[column] === value); return query; },
        in(column, values) { predicates.push((row) => values.includes(row[column])); return query; },
        is(column, value) { predicates.push((row) => row[column] === value); return query; },
        order(column, { ascending }) { orders.push({ column, ascending }); return query; },
        range(from, to) { range = [from, to]; return query; },
        then(resolve, reject) {
          try {
            assert.ok(range);
            calls.push({ orders, range });
            if (range[0] === failAtOffset) {
              return Promise.resolve({ data: null, error: { message: "page failed" } }).then(resolve, reject);
            }
            const matching = records.filter((row) => predicates.every((predicate) => predicate(row)));
            matching.sort((a, b) => {
              for (const { column, ascending } of orders) {
                const result = String(a[column]).localeCompare(String(b[column]));
                if (result) return ascending ? result : -result;
              }
              // PostgREST is free to reorder ties between separate page requests.
              return range[0] === 0 ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
            });
            const data = matching.slice(range[0], Math.min(range[1] + 1, range[0] + 1000));
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          } catch (error) {
            return Promise.reject(error).then(resolve, reject);
          }
        },
      };
      return query;
    },
  };
}

for (const [table, column] of [
  ["wb_orders", "order_date"],
  ["wb_sales", "sale_date"],
  ["wb_finance", "operation_date"],
  ["wb_ads", "campaign_date"],
]) {
  const client = fakeClient(table, column);
  const rows = await fetchAllInDateRange(client, table, {
    column,
    from: "2026-09-01",
    to: "2026-09-01",
    marketplaceAccountId: "account-a",
    inFilters: [{ column: "product_id", values: ["product-a"] }],
  });
  assert.equal(rows.length, 1005, table);
  assert.equal(new Set(rows.map((row) => row.id)).size, 1005, table);
  assert.ok(rows.every((row) => row.marketplace_account_id === "account-a"));
  assert.deepEqual(client.calls.map((call) => call.range), [[0, 999], [1000, 1999]]);
  assert.ok(client.calls.every((call) =>
    call.orders.length === 2 && call.orders[0].column === column && call.orders[1].column === "id"
  ));
}

const costClient = fakeClient("product_cost_history", "effective_from");
const costs = await fetchAllRows(costClient, "product_cost_history", {
  marketplaceAccountId: "account-a",
  inFilters: [{ column: "product_id", values: ["product-a"] }],
  orderBy: { column: "effective_from", ascending: false },
});
assert.equal(costs.length, 1005);
assert.equal(new Set(costs.map((row) => row.id)).size, 1005);
assert.ok(costClient.calls.every((call) =>
  call.orders.length === 2 && call.orders[0].column === "effective_from" &&
  call.orders[0].ascending === false && call.orders[1].column === "id"
));

await assert.rejects(
  fetchAllInDateRange(fakeClient("wb_sales", "sale_date", { failAtOffset: 1000 }), "wb_sales", {
    column: "sale_date", from: "2026-09-01", to: "2026-09-01",
    marketplaceAccountId: "account-a",
  }),
  /page failed/
);

console.log("PASS financial pagination: 1005 tied-date rows per table, cost history, account isolation, page failure");
