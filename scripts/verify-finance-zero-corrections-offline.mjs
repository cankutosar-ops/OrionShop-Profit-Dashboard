#!/usr/bin/env node
import assert from "node:assert/strict";
import { mapFinanceRowsFromReport } from "../src/lib/wildberries/mappers.ts";
import { mapFinanceRowsFromV1Detailed, parseFinanceV1Money } from "../src/lib/wildberries/finance-v1.ts";

const fields = ["ppvz_sales_commission", "delivery_rub", "storage_fee", "penalty",
  "rebill_logistic_cost", "deduction", "acceptance", "acquiring_fee", "ppvz_reward",
  "additional_payment", "ppvz_vw", "ppvz_for_pay"];
const base = { rrd_id: 123, rr_dt: "2026-09-01", supplier_oper_name: "Продажа" };
const db = new Map();
const persist = (account, lines) => {
  for (const line of lines) db.set(`${account}:${line.source_key}`, line.amount);
};
for (const field of fields) {
  const before = mapFinanceRowsFromReport({ ...base, [field]: 42 }, null);
  const after = mapFinanceRowsFromReport({ ...base, [field]: 0 }, null);
  assert.equal(before.length, 1, field);
  assert.equal(after.length, 1, field);
  assert.equal(after[0].source_key, before[0].source_key);
  assert.equal(after[0].amount, 0);
  persist("1", before);
  persist("2", before);
  persist("1", after);
  persist("1", after);
  assert.equal(db.get(`1:${before[0].source_key}`), 0);
  assert.equal(db.get(`2:${before[0].source_key}`), 42);
  for (const absent of [undefined, null, NaN, Infinity]) {
    assert.deepEqual(mapFinanceRowsFromReport({ ...base, [field]: absent }, null), []);
  }
}
const v1 = { rrdId: 124, rrDate: "2026-09-01", forPay: "0", deliveryService: "0", deliveryAmount: 7 };
const normalized = mapFinanceRowsFromV1Detailed(v1, null);
for (const invalid of ["garbage", "0invalid", " ", Infinity, NaN]) {
  assert.equal(parseFinanceV1Money(invalid), undefined);
  assert.deepEqual(mapFinanceRowsFromV1Detailed({ rrdId: 125, forPay: invalid }, null), []);
}
assert.equal(normalized.length, 2);
assert.ok(normalized.every((line) => line.amount === 0));
const returned = mapFinanceRowsFromReport({ ...base, doc_type_name: "Возврат", ppvz_for_pay: 42 }, null);
assert.equal(returned[0].amount, -42);
const fallback = mapFinanceRowsFromReport({ ...base, supplier_oper_name: "Хранение", delivery_rub: 0, storage_fee: 0 }, null);
assert.ok(fallback.some((line) => line.wb_source_suffix === "oper_storage" && line.amount === 0));
console.log("PASS finance explicit-zero corrections, stable keys, replay, account isolation, absent fields, V1 and return signs");
