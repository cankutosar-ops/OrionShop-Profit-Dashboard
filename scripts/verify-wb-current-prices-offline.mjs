#!/usr/bin/env node
/** Offline durable-price contract; the fake DB survives new upsert instances. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WildberriesWarehouseEntityUpsert } from "../src/lib/marketplace-adapters/wildberries/entity-upsert.ts";

const persisted = new Map();
let fail = false;
const client = () => ({
  from(table) {
    assert.equal(table, "wb_current_prices");
    return {
      async upsert(rows, options) {
        assert.equal(options.onConflict, "marketplace_account_id,nm_id");
        if (fail) return { error: { message: "offline write failure" } };
        for (const row of rows) persisted.set(`${row.marketplace_account_id}:${row.nm_id}`, structuredClone(row));
        return { error: null };
      },
    };
  },
});
const scope = (account) => ({ marketplaceType: "wildberries", companyId: "company", marketplaceAccountId: account });
const price = (nm, amount) => ({
  externalProductId: String(nm), price: amount, currency: "RUB",
  observedAt: "2026-09-17T12:00:00.000Z",
});
const first = new WildberriesWarehouseEntityUpsert("1", client);
assert.equal((await first.upsertPrices(scope("1"), [price(10, 99), price(11, null)])).upserted, 2);
assert.equal(persisted.size, 2);
const restarted = new WildberriesWarehouseEntityUpsert("1", client);
assert.equal((await restarted.upsertPrices(scope("1"), [price(10, 95)])).upserted, 1);
assert.equal(persisted.get("1:10").price, 95);
assert.equal(persisted.get("1:11").price, null);
assert.equal(persisted.size, 2);
await assert.rejects(restarted.upsertPrices(scope("2"), [price(10, 1)]), /account mismatch/);
assert.equal(persisted.has("2:10"), false);
fail = true;
await assert.rejects(restarted.upsertPrices(scope("1"), [price(12, 1)]), /write failure/);
assert.equal(persisted.has("1:12"), false);
const sql = readFileSync("supabase/migrations/20260917130000_wb_current_prices.sql", "utf8");
assert.match(sql, /PRIMARY KEY \(marketplace_account_id, nm_id\)/);
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON TABLE public\.wb_current_prices FROM PUBLIC, anon, authenticated/);
console.log("PASS durable current prices: process-instance restart, account isolation, idempotent key, failed write, DB/RLS contract");
