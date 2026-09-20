#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WildberriesMarketplaceAdapter } from "../src/lib/marketplace-adapters/wildberries/warehouse-adapter.ts";
import { WildberriesWarehouseEntityUpsert } from "../src/lib/marketplace-adapters/wildberries/entity-upsert.ts";
import { persistCanonicalCurrentStocks } from "../src/lib/marketplace-adapters/wildberries/canonical-stock.ts";
import { reconcileCurrentStock } from "../src/lib/current-stock-reconciliation.ts";
import { currentStockSource, readCurrentStockRows } from "../src/services/current-stock-repository.ts";
import { mapApiProductVariants } from "../src/lib/wildberries/mappers.ts";

const persisted = new Map();
const legacy = new Map();
const catalog = [
  { marketplace_account_id: "1", nm_id: 100, chrt_id: 201, tech_size: "M", barcode: "BC-M" },
  { marketplace_account_id: "1", nm_id: 100, chrt_id: 202, tech_size: "L", barcode: null },
  { marketplace_account_id: "2", nm_id: 100, chrt_id: 201, tech_size: "M", barcode: "OTHER" },
];
let failNextWrite = false;
function fakeDb() {
  return {
    async rpc(name, args) {
      assert.equal(name, "replace_wb_current_stocks_verified");
      if (failNextWrite) { failNextWrite = false; return { error: { message: "database unavailable" } }; }
      const account = String(args.p_account_id);
      const next = new Set();
      for (const row of args.p_rows) {
        const key = `${account}:${row.nm_id}:${row.chrt_id}:${row.warehouse_key}`;
        next.add(key);
        persisted.set(key, structuredClone(row));
      }
      for (const key of persisted.keys()) {
        if (key.startsWith(`${account}:`) && !next.has(key)) persisted.delete(key);
      }
      return { error: null, data: next.size };
    },
    from(table) {
      if (table === "product_variants") {
        let account;
        return {
          select() { return this; },
          eq(_field, value) { account = value; return this; },
          not() { return this; },
          order() { return this; },
          async range(from, to) { return { data: catalog.filter((r) => r.marketplace_account_id === account).slice(from, to + 1), error: null }; },
        };
      }
      if (table === "wb_stock") {
        return { async upsert(rows) {
          if (failNextWrite) { failNextWrite = false; return { error: { message: "database unavailable" } }; }
          const target = legacy;
          for (const row of rows) {
            const key = `${row.marketplace_account_id}:${row.product_id}:${row.tech_size}:${row.barcode}:${row.warehouse}`;
            target.set(key, structuredClone(row));
          }
          return { error: null };
        } };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

const adapter = new WildberriesMarketplaceAdapter({ apiKey: "offline" });
adapter.client.fetchWbWarehousesStock = async () => [
  { nmId: 100, chrtId: 201, warehouseId: 7, warehouseName: "North", quantity: 5 },
  { nmId: 100, chrtId: 202, warehouseId: 7, warehouseName: "North", quantity: 3 },
  { nmId: 100, chrtId: 201, warehouseId: 8, warehouseName: "South", quantity: 4 },
];
const scope1 = { marketplaceType: "wildberries", marketplaceAccountId: "1" };
const items = (await adapter.fetchStocks(scope1)).items;
assert.deepEqual(items.map((item) => item.externalVariantId), ["201", "202", "201"]);
assert.deepEqual(items.map((item) => item.warehouseId), [7, 7, 8]);
const first = new WildberriesWarehouseEntityUpsert("1", fakeDb);
first.productIdByNm.set(100, "product-1");
await first.upsertStocks(scope1, items);
assert.equal(persisted.size, 0, "generic legacy sync is not a canonical producer");
await persistCanonicalCurrentStocks("1", items, fakeDb());
assert.equal(persisted.size, 3, "two sizes and two warehouses survive");
assert.equal(legacy.size, 2, "legacy lossy warehouse rows stay separate");
assert.equal(persisted.get("1:100:201:id:7").barcode, "BC-M");
assert.equal(persisted.get("1:100:202:id:7").barcode, null);
assert.equal(persisted.get("1:100:201:id:7").tech_size, "M");

// A new upsert instance simulates a process restart; durable DB state survives.
const restarted = new WildberriesWarehouseEntityUpsert("1", fakeDb);
restarted.productIdByNm.set(100, "product-1");
await persistCanonicalCurrentStocks("1", items, fakeDb());
assert.equal(persisted.size, 3, "idempotent re-sync");
await persistCanonicalCurrentStocks("1", [{ ...items[0], quantity: 9 }, items[1], items[2]], fakeDb());
assert.equal(persisted.size, 3, "quantity update does not duplicate identity");
assert.equal(persisted.get("1:100:201:id:7").quantity, 9);
assert.equal([...persisted.values()].reduce((sum, row) => sum + row.quantity, 0), 16);
await persistCanonicalCurrentStocks("1", [{ ...items[0], quantity: 9 }], fakeDb());
assert.equal(persisted.size, 1, "absent identities leave the current snapshot atomically");

await persistCanonicalCurrentStocks("2", [items[0]], fakeDb());
assert.equal(persisted.size, 2, "accounts cannot collide");
assert.equal(persisted.get("2:100:201:id:7").barcode, "OTHER");
await persistCanonicalCurrentStocks("1", items, fakeDb());
function readDb() {
  return { from(table) {
    let account;
    let product;
    const query = {
      select() { return this; },
      eq(column, value) { if (column === "marketplace_account_id") account = value; if (column === "product_id") product = value; return this; },
      order() { return this; },
      range(from, to) {
        const data = table === "products"
          ? [{ id: account === "1" ? "product-1" : "product-2", nm_id: 100 }]
          : [...persisted.values()].filter((row) => row.marketplace_account_id === account);
        return Promise.resolve({ data: data.slice(from, to + 1), error: null });
      },
      then(resolve) {
        const data = [...legacy.values()].filter((row) => row.marketplace_account_id === account && (!product || row.product_id === product));
        resolve({ data, error: null });
      },
    };
    return query;
  } };
}
const oldGate = process.env.ORION_CURRENT_STOCK_SOURCE;
delete process.env.ORION_CURRENT_STOCK_SOURCE;
assert.equal((await readCurrentStockRows("1", readDb())).length, 2, "default reads retain legacy rows");
process.env.ORION_CURRENT_STOCK_SOURCE = "canonical";
const gated = await readCurrentStockRows("1", readDb());
assert.equal(gated.length, 3, "canonical gate sees all current identities");
assert.equal(new Set(gated.map((row) => row.chrt_id)).size, 2);
assert.equal(gated.reduce((sum, row) => sum + row.quantity, 0), 12);
if (oldGate === undefined) delete process.env.ORION_CURRENT_STOCK_SOURCE;
else process.env.ORION_CURRENT_STOCK_SOURCE = oldGate;
await assert.rejects(() => restarted.upsertStocks({ ...scope1, marketplaceAccountId: "2" }, items));
failNextWrite = true;
await assert.rejects(() => persistCanonicalCurrentStocks("1", [items[0]], fakeDb()), /database unavailable/);

const variants = mapApiProductVariants({ nmID: 100, sizes: [{ chrtID: 201, techSize: "M", skus: ["BC-M"] }] }, "product-1");
assert.equal(variants[0].chrt_id, 201, "catalog ingestion preserves chrt ID");
assert.equal(currentStockSource(), "legacy", "production read gate defaults to legacy");
const result = reconcileCurrentStock(
  [{ nmId: 100, warehouse: "North", quantity: 12, variant: null }],
  [{ nmId: 100, warehouse: "North", quantity: 9, variant: "M|BC-M" },
   { nmId: 100, warehouse: "North", quantity: 3, variant: null }]
);
assert.equal(result.total.difference, 0);
assert.equal(result.uncomparableLegacyRows, 1);
assert.equal(result.variantDifferences.length, 0, "legacy loss is not forced into variant equality");
const migration = readFileSync("supabase/migrations/20260917140000_wb_canonical_current_stocks.sql", "utf8");
assert.match(migration, /PRIMARY KEY \(marketplace_account_id, nm_id, chrt_id, warehouse_key\)/);
assert.doesNotMatch(migration, /DELETE FROM public\.wb_stock|UPDATE public\.wb_stock|UPDATE public\.historical_inventory_snapshots|DELETE FROM public\.historical_inventory_snapshots/i);
console.log("canonical current stock offline checks OK");
