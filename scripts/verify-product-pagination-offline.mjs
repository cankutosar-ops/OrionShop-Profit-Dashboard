#!/usr/bin/env node
/** Offline regression for account-scoped product reads beyond one PostgREST page. */
import assert from "node:assert/strict";
import { fetchProductsWithRelations } from "../src/services/persisted-query-service.ts";
import { fetchProductOptions } from "../src/services/cost-service.ts";
import { WbSyncService } from "../src/lib/wildberries/sync-service.ts";

const products = [
  ...Array.from({ length: 1205 }, (_, index) => ({
    id: `a-${String(index).padStart(4, "0")}`,
    marketplace_account_id: "account-a",
    brand_id: index < 1100 ? "brand-1" : "brand-2",
    nm_id: index + 1,
    supplier_article: `article-${String(1205 - index).padStart(4, "0")}`,
    name: `Product ${index}`,
  })),
  ...Array.from({ length: 25 }, (_, index) => ({
    id: `b-${String(index).padStart(4, "0")}`,
    marketplace_account_id: "account-b",
    brand_id: "brand-1",
    nm_id: 9000 + index,
    supplier_article: `other-${index}`,
    name: `Other ${index}`,
  })),
].reverse();

function fakeClient({ failAtOffset = -1 } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "products");
      const filters = [];
      let selection = "*";
      let order;
      let range;
      const query = {
        select(columns) { selection = columns; return query; },
        eq(column, value) { filters.push([column, value]); return query; },
        order(column, options) { order = [column, options.ascending]; return query; },
        range(from, to) { range = [from, to]; return query; },
        then(resolve, reject) {
          try {
            assert.deepEqual(order, ["id", true]);
            assert.ok(range, "each query must request an explicit range");
            assert.ok(range[1] - range[0] + 1 <= 1000);
            calls.push({ filters, selection, range });
            if (range[0] === failAtOffset) {
              return Promise.resolve({ data: null, error: { message: "page failed" } }).then(resolve, reject);
            }
            const matching = products
              .filter((row) => filters.every(([key, value]) => row[key] === value))
              .sort((a, b) => a.id.localeCompare(b.id));
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

const client = fakeClient();
const all = await fetchProductsWithRelations("account-a", client);
assert.equal(all.length, 1205);
assert.equal(new Set(all.map((row) => row.id)).size, 1205);
assert.ok(all.every((row) => row.marketplace_account_id === "account-a"));
assert.deepEqual(client.calls.map((call) => call.range), [[0, 999], [1000, 1999]]);

const brandClient = fakeClient();
const brandProducts = await fetchProductsWithRelations("account-a", brandClient, { brandId: "brand-1" });
assert.equal(brandProducts.length, 1100);
assert.ok(brandProducts.every((row) => row.brand_id === "brand-1"));
assert.deepEqual(brandClient.calls.map((call) => call.range), [[0, 999], [1000, 1999]]);

const other = await fetchProductsWithRelations("account-b", fakeClient());
assert.equal(other.length, 25);
assert.ok(other.every((row) => row.marketplace_account_id === "account-b"));

const options = await fetchProductOptions("account-a", fakeClient());
assert.equal(options.length, 1205);
assert.equal(new Set(options.map((row) => row.id)).size, 1205);
assert.ok(options.every((row, index) => index === 0 || options[index - 1].supplier_article <= row.supplier_article));

const sync = new WbSyncService({}, "account-a");
const lookup = await sync.buildProductLookup(fakeClient());
assert.equal(lookup.size, 1205);
assert.equal(lookup.get(1205), "a-1204");
assert.equal(lookup.has(9000), false);

await assert.rejects(
  fetchProductsWithRelations("account-a", fakeClient({ failAtOffset: 1000 })),
  /page failed/
);

console.log("PASS product pagination: 1205 scoped products, brand filter, cost options, sync lookup, page failure");
