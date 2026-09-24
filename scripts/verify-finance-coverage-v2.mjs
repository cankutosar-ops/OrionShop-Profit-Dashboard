#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildFinanceInactiveReadModel,
  FINANCE_COVERAGE_GENERATIONS,
  verifyFinanceCoverage,
} from "../src/lib/finance-coverage.ts";
import {
  buildProductMarketplaceFeeParts,
  rollupCategoriesToProfitBuckets,
  summarizeFinanceByCategory,
} from "../src/lib/finance-rollup.ts";
import {
  effectiveFinanceCategory,
  isInactiveFinanceEvidenceCategory,
} from "../src/lib/finance-category.ts";
import { calculateModelBNetProfit } from "../src/lib/profit-engine-model-b.ts";
import { mapFinanceRowsFromV1Detailed } from "../src/lib/wildberries/finance-v1.ts";

const inputFlagIndex = process.argv.findIndex(
  (arg) => arg === "--input" || arg.startsWith("--input=")
);
if (inputFlagIndex >= 0) {
  const arg = process.argv[inputFlagIndex];
  const inputPath = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : process.argv[inputFlagIndex + 1];
  if (!inputPath) throw new Error("--input requires a JSON file path");
  const payload = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
  const result = verifyFinanceCoverage(payload);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

const base = {
  rrdId: 991,
  reportId: 77,
  nmId: 12345,
  rrDate: "2026-09-20",
  sellerOperName: "Продажа",
  docTypeName: "Продажа",
};

function asPersisted(lines, account = "1") {
  return lines.map((line, index) => ({
    id: String(index + 1),
    marketplace_account_id: account,
    ...line,
  }));
}

assert.equal(
  FINANCE_COVERAGE_GENERATIONS.MODERN_REPORTS_V1,
  "fully_classified_moving_forward"
);
assert.equal(
  FINANCE_COVERAGE_GENERATIONS.LEGACY_ROWS,
  "historical_classification_uncertainty"
);

const signed = asPersisted(
  mapFinanceRowsFromV1Detailed(
    {
      ...base,
      vw: "-100",
      vwNds: "-22",
      installmentCofinancingAmount: "15",
      cashbackAmount: "8",
      cashbackDiscount: "3",
      cashbackCommissionChange: "2",
      paymentSchedule: "4",
      acquiringFee: "11",
    },
    null
  )
);

const bySuffix = new Map(signed.map((row) => [row.wb_source_suffix, row]));
assert.equal(bySuffix.get("ppvz_vw")?.amount, 100);
assert.equal(bySuffix.get("ppvz_vw")?.raw_amount, -100);
assert.equal(bySuffix.get("vw_nds")?.amount, 22);
assert.equal(bySuffix.get("vw_nds")?.raw_amount, -22);
assert.equal(bySuffix.get("vw_nds")?.source_key, "rrd:991:vw_nds");
assert.equal(bySuffix.get("vw_nds")?.finance_category, "PPVZ_VW_NDS");
assert.equal(
  bySuffix.get("installment_cofinancing")?.finance_category,
  "ACQUIRING_COFINANCING_REVIEW"
);
assert.equal(bySuffix.get("cashback_amount")?.finance_category, "LOYALTY_CASHBACK_EXPENSE");
assert.equal(bySuffix.get("cashback_discount")?.finance_category, "COMPENSATION");
assert.equal(
  bySuffix.get("cashback_commission_change")?.finance_category,
  "LOYALTY_CASHBACK_PARTICIPATION"
);
assert.equal(bySuffix.get("payment_schedule")?.finance_category, "FINANCE_SERVICE_FEE");

const evidence = buildFinanceInactiveReadModel(signed);
assert.equal(evidence.wbRemuneration.vw.value, -100);
assert.equal(evidence.wbRemuneration.vwNds.value, -22);
assert.equal(evidence.wbRemuneration.includingVat, -122);
assert.equal(evidence.cashbackExpense.value, 8);
assert.equal(evidence.cashbackCompensation.value, 3);
assert.equal(evidence.cashbackParticipationCost.value, 2);
assert.equal(evidence.paymentScheduleFee.value, 4);
assert.equal(evidence.cofinancingEvidence.value, 15);

const positive = asPersisted(
  mapFinanceRowsFromV1Detailed({ ...base, rrdId: 992, vwNds: "22" }, null)
);
assert.equal(positive[0]?.raw_amount, 22);

const zero = asPersisted(
  mapFinanceRowsFromV1Detailed(
    {
      ...base,
      rrdId: 993,
      vwNds: "0",
      installmentCofinancingAmount: "0",
      cashbackAmount: "0",
      cashbackDiscount: "0",
      cashbackCommissionChange: "0",
      paymentSchedule: "0",
    },
    null
  )
);
assert.equal(zero.length, 6);
assert.ok(zero.every((line) => line.amount === 0 && line.raw_amount === 0));

for (const [field, suffix] of [
  ["vwNds", "vw_nds"],
  ["installmentCofinancingAmount", "installment_cofinancing"],
  ["cashbackAmount", "cashback_amount"],
  ["cashbackDiscount", "cashback_discount"],
  ["cashbackCommissionChange", "cashback_commission_change"],
  ["paymentSchedule", "payment_schedule"],
]) {
  assert.deepEqual(
    mapFinanceRowsFromV1Detailed({ ...base, rrdId: 994, [field]: "invalid" }, null),
    []
  );
  const missing = mapFinanceRowsFromV1Detailed({ ...base, rrdId: 995 }, null);
  assert.equal(missing.some((line) => line.wb_source_suffix === suffix), false);
}

const returned = asPersisted(
  mapFinanceRowsFromV1Detailed(
    {
      ...base,
      rrdId: 996,
      sellerOperName: "Возврат",
      docTypeName: "Возврат",
      forPay: "50",
      vw: "-10",
      vwNds: "-2.2",
    },
    null
  )
);
assert.equal(bySuffix.get("ppvz_vw")?.raw_amount, -100);
assert.equal(returned.find((row) => row.wb_source_suffix === "for_pay")?.raw_amount, -50);
assert.equal(buildFinanceInactiveReadModel(returned).wbRemuneration.includingVat, -12.2);

const legacyOnly = signed.filter(
  (row) => !isInactiveFinanceEvidenceCategory(effectiveFinanceCategory(row))
);
const allRollup = rollupCategoriesToProfitBuckets(signed);
const legacyRollup = rollupCategoriesToProfitBuckets(legacyOnly);
assert.deepEqual(allRollup, legacyRollup, "inactive evidence must not enter V4 profit buckets");

const categories = summarizeFinanceByCategory(signed);
assert.equal(categories.ACQUIRING, 11, "cofinancing must not be added to acquiring");
assert.equal(categories.ACQUIRING_COFINANCING_REVIEW, 15);
assert.equal(categories.PPVZ_VW, 100);
assert.equal(categories.PPVZ_VW_NDS, 22);
const feeParts = buildProductMarketplaceFeeParts(signed);
assert.equal(feeParts.reimbursements, 3);
assert.equal(feeParts.marketplaceFees, 111, "VW VAT and inactive candidates stay out of fees");
const modelWithCompensation = calculateModelBNetProfit({
  grossSales: 1000,
  returnedSales: 0,
  netSales: 1000,
  netSalesStatus: "ready",
  salesForPay: 800,
  financeNetForPay: 800,
  acquiring: categories.ACQUIRING,
  logistics: 0,
  storage: 0,
  penalties: 0,
  adjustments: feeParts.accountAdjustments,
  acceptance: 0,
  productCost: 100,
  advertising: 0,
  customerPaid: 1000,
  taxPercent: 0,
});
assert.equal(modelWithCompensation.finalNetProfit, 700, "compensation is not deducted");

const coverage = verifyFinanceCoverage({
  finance: signed,
  listControls: {
    cashbackAmountSum: 8,
    cashbackDiscountSum: 3,
    cashbackCommissionChangeSum: 2,
    paymentSchedule: 4,
  },
  detailedSourceTotals: {
    vwNds: -22,
    installmentCofinancingAmount: 15,
    cashbackAmount: 8,
    cashbackDiscount: 3,
    cashbackCommissionChange: 2,
    paymentSchedule: 4,
  },
});
assert.equal(coverage.ok, true, JSON.stringify(coverage.issues));

const brokenCoverage = verifyFinanceCoverage({
  finance: signed.filter((row) => row.wb_source_suffix !== "vw_nds"),
  detailedSourceTotals: { vwNds: -22 },
});
assert.equal(brokenCoverage.ok, false);
assert.ok(brokenCoverage.issues.some((issue) => issue.code === "UNMAPPED_NON_ZERO_FIELD"));

const duplicated = verifyFinanceCoverage({ finance: [...signed, signed[0]] });
assert.ok(duplicated.issues.some((issue) => issue.code === "DUPLICATE_SOURCE_KEY"));
const nullKey = verifyFinanceCoverage({ finance: [{ ...signed[0], source_key: null }] });
assert.ok(nullKey.issues.some((issue) => issue.code === "NULL_SOURCE_KEY"));
const unexpected = verifyFinanceCoverage({
  finance: [{ ...signed[0], source_key: "rrd:991:future_field", wb_source_suffix: "future_field" }],
});
assert.ok(unexpected.issues.some((issue) => issue.code === "UNEXPECTED_SUFFIX"));
const mismatch = verifyFinanceCoverage({
  finance: signed,
  listControls: { cashbackAmountSum: 999 },
});
assert.ok(mismatch.issues.some((issue) => issue.code === "RECONCILIATION_MISMATCH"));

const kpiSync = readFileSync(
  resolve("src/lib/marketplace-adapters/wildberries/kpi-snapshot-sync.ts"),
  "utf8"
);
assert.match(kpiSync, /warehouse_sales_report_snapshot/);
assert.doesNotMatch(kpiSync, /mapFinanceRowsFromV1Detailed|mapFinanceRowsFromReport/);

const apiClient = readFileSync(resolve("src/lib/wildberries/api-client.ts"), "utf8");
assert.doesNotMatch(
  apiClient,
  /finance\/v1\/acquiring\/(?:list|detailed)/,
  "Acquiring Reports must remain reconciliation-only and absent from transaction ingestion"
);

const migration = readFileSync(
  resolve("supabase/migrations/20260924120000_finance_coverage_v2.sql"),
  "utf8"
);
assert.match(migration, /ADD COLUMN IF NOT EXISTS raw_amount NUMERIC/);
assert.doesNotMatch(migration, /UPDATE\s+public\.wb_finance/i);
assert.doesNotMatch(migration, /DELETE\s+FROM\s+public\.wb_finance/i);
assert.doesNotMatch(migration, /TRUNCATE/i);

console.log(
  "PASS Finance Coverage V2 raw signs, six fields, inactive categories, controls, reconciliation and double-count guards"
);
