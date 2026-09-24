#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calculateMarketplaceFees,
  calculateSalesToSettlementDifference,
  calculateWbRemuneration,
} from "../src/lib/marketplace-fees.ts";

const row = (suffix, amount, rawAmount = amount, productId = "product-1") => ({
  id: `row-${suffix}-${Math.random()}`,
  marketplace_account_id: "account-1",
  product_id: productId,
  nm_id: 101,
  operation_date: "2026-09-20",
  operation_type: "other",
  amount,
  raw_amount: rawAmount,
  source_key: `rrd:1:${suffix}`,
  wb_source_suffix: suffix,
  finance_category: "OTHER",
  description: null,
  srid: null,
});

const finance = [
  row("commission", 10, -10),
  row("acquiring_fee", 20, -20),
  row("ppvz_reward", 30, 30),
  row("ppvz_vw", 40, -40),
  row("vw_nds", 8, -8),
  row("acceptance", 100, -100),
  row("logistics", 200, -200),
  row("storage", 300, -300),
  row("deduction", 400, -400),
  row("additional_payment", 500, 500),
  row("cashback_discount", 600, 600),
  row("installment_cofinancing", 700, -700),
  row("payment_schedule", 800, -800),
  row("unknown_other", 900, -900),
  row("commission", 5, -5, null),
];

const fees = calculateMarketplaceFees(finance);
assert.equal(fees.marketplaceFees, 113, "only five explicit suffixes enter Marketplace Fees");
assert.deepEqual(
  {
    commission: fees.commission,
    acquiring: fees.acquiring,
    ppvzReward: fees.ppvzReward,
    ppvzVw: fees.ppvzVw,
    ppvzVwNds: fees.ppvzVwNds,
  },
  { commission: 15, acquiring: 20, ppvzReward: 30, ppvzVw: 40, ppvzVwNds: 8 }
);
assert.equal(fees.attributedMarketplaceFees, 108);
assert.equal(fees.unattributedMarketplaceFees, 5);

const difference = calculateSalesToSettlementDifference(1_000, 650);
assert.equal(difference, 350);
assert.notEqual(difference, fees.marketplaceFees, "reconciliation difference is not Marketplace Fees");

const remuneration = calculateWbRemuneration(finance, 1_000);
assert.equal(remuneration.status, "AVAILABLE");
assert.equal(remuneration.value, -48, "signed vwNds must be included with signed vw");
assert.equal(remuneration.percentOfNetSales, -4.8);

const legacy = calculateWbRemuneration(
  [row("ppvz_vw", 40, null), row("vw_nds", 8, null)],
  1_000
);
assert.equal(legacy.status, "LEGACY_RAW_UNAVAILABLE");
assert.equal(legacy.value, null, "legacy normalized amounts cannot fabricate signed remuneration");

const sourceFiles = [
  "src/components/dashboard/dashboard-profit-section.tsx",
  "src/lib/reporting/module/pnl-report.ts",
  "src/lib/reporting/module/settlement-report.ts",
].map((file) => readFileSync(resolve(file), "utf8")).join("\n");
assert.doesNotMatch(
  sourceFiles,
  /Marketplace Fee[^\n]*(?:Net Sales|Sales API forPay)|(?:Net Sales|Sales API forPay)[^\n]*Marketplace Fee/,
  "current dashboard/report copy must not relabel the reconciliation difference as Marketplace Fees"
);

console.log("Marketplace Fees canonical contract verified");
