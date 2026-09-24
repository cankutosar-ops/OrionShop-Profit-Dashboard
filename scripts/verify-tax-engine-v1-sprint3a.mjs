import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assessFinanceTaxableRevenueEvidence,
  classifyFinanceTransaction,
  mapFinanceTransactionEvidence,
  persistFinanceTransactionEvidence,
} from "../src/lib/tax-engine/finance-transaction-evidence.ts";
import { calculateTaxYtd } from "../src/lib/tax-engine/calculator.ts";
import { normalizeFinanceV1DetailedRow } from "../src/lib/wildberries/finance-v1.ts";

const profile = (taxObject, rate, vatStatus = "UNKNOWN") => ({
  id: "p", company_id: "1", tax_system: "USN", tax_object: taxObject,
  tax_rate: rate, minimum_tax_rate: 1, effective_from: "2026-01-01",
  effective_to: null, region_code: null, vat_status: vatStatus,
  created_at: "", updated_at: "",
});

const raw = (overrides = {}) => ({
  rrdId: 101, reportId: 7001, nmId: 5001, vendorCode: "SKU-1",
  rrDate: "2026-09-20", saleDt: "2026-09-18T12:00:00Z",
  sellerOperName: "Продажа", docTypeName: "Продажа", quantity: 1,
  retailPrice: "2000", retailAmount: "1500.25", retailPriceWithDisc: "1600.50",
  forPay: "1230.10", additionalPayment: "0", cashbackDiscount: "0",
  srid: "safe.fixture.1", sku: "4600000000001", ...overrides,
});

const normalized = normalizeFinanceV1DetailedRow(raw());
assert.equal(normalized.quantity, 1);
assert.equal(normalized.retail_price, 2000);
assert.equal(normalized.retail_amount, 1500.25);
assert.equal(normalized.retail_price_withdisc_rub, 1600.5);
assert.equal(normalized.order_dt, undefined);

const sale = mapFinanceTransactionEvidence(normalized, "1", "2026-09-21T10:00:00Z");
assert.equal(sale.rrd_id, 101);
assert.equal(sale.report_id, 7001);
assert.equal(sale.tax_classification, "TAXABLE_SALE");
assert.equal(sale.operation_context, "SALE");
assert.equal(sale.tax_effective_date, null);
assert.equal(sale.tax_effective_date_status, "UNVERIFIED");

const returned = normalizeFinanceV1DetailedRow(raw({
  rrdId: 102, sellerOperName: "Возврат", docTypeName: "Возврат", retailAmount: "400.25",
}));
assert.deepEqual(classifyFinanceTransaction(returned), {
  operationContext: "RETURN", taxClassification: "TAXABLE_REFUND",
});
const correction = normalizeFinanceV1DetailedRow(raw({
  rrdId: 103, sellerOperName: "Корректировка", docTypeName: "Корректировка", retailAmount: "25",
}));
assert.equal(classifyFinanceTransaction(correction).taxClassification, "REVIEW");
assert.equal(classifyFinanceTransaction(correction).operationContext, "CORRECTION");
const compensation = normalizeFinanceV1DetailedRow(raw({
  rrdId: 104, sellerOperName: "Компенсация", docTypeName: "", retailAmount: "0",
  additionalPayment: "50",
}));
assert.equal(classifyFinanceTransaction(compensation).operationContext, "COMPENSATION");
assert.equal(classifyFinanceTransaction(compensation).taxClassification, "REVIEW");
const saleWithCashback = normalizeFinanceV1DetailedRow(raw({
  rrdId: 105, cashbackDiscount: "12.50",
}));
assert.equal(classifyFinanceTransaction(saleWithCashback).operationContext, "SALE");
assert.equal(classifyFinanceTransaction(saleWithCashback).taxClassification, "TAXABLE_SALE");

const evidence = (row, account = "1") => mapFinanceTransactionEvidence(row, account, "2026-09-21T10:00:00Z");
const controls = [{
  marketplace_account_id: 1, report_id: 7001, date_from: "2026-09-14",
  date_to: "2026-09-20", retail_amount_sum: 1500.25,
}, {
  marketplace_account_id: 1, report_id: 7002, date_from: "2026-09-14",
  date_to: "2026-09-20", retail_amount_sum: 400.25,
}];
const complete = assessFinanceTaxableRevenueEvidence({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 13.5, "EXEMPT"),
  rows: [evidence(normalized), evidence({ ...returned, realizationreport_id: 7002 })],
  controls, from: "2026-09-14", to: "2026-09-20",
});
assert.equal(complete.status, "UNVERIFIED");
assert.equal(complete.saleAmountKopeks, 150025);
assert.equal(complete.refundAmountKopeks, 40025);
assert.equal(complete.candidateBeforeVatKopeks, 110000);
assert.deepEqual(complete.reasons, ["TAX_EFFECTIVE_DATE_POLICY_UNAPPROVED"]);

const mismatch = assessFinanceTaxableRevenueEvidence({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 15), rows: [evidence(normalized)],
  controls: [{ ...controls[0], retail_amount_sum: 1600 }],
  from: "2026-09-14", to: "2026-09-20",
});
assert.equal(mismatch.status, "PARTIAL");
assert.ok(mismatch.reasons.some((reason) => reason.startsWith("REPORT_RECONCILIATION_MISMATCH")));
assert.ok(mismatch.reasons.includes("VAT_TREATMENT_UNVERIFIED"));

const account1Fixture = assessFinanceTaxableRevenueEvidence({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 13.5, "EXEMPT"),
  rows: [evidence(normalizeFinanceV1DetailedRow(raw({ retailAmount: "99805.11" })))],
  controls: [{ ...controls[0], retail_amount_sum: 99805.11 }],
  from: "2026-09-14", to: "2026-09-20",
});
assert.ok(!account1Fixture.reasons.some((reason) => reason.startsWith("REPORT_RECONCILIATION_MISMATCH")));

const account2ReportRetail = 142_724.98;
const account2SalesFinishedPrice = 133_203.00;
assert.equal(Math.round((account2ReportRetail - account2SalesFinishedPrice) * 100), 952_198);
const account2Fixture = assessFinanceTaxableRevenueEvidence({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 13.5, "EXEMPT"),
  rows: [evidence(normalizeFinanceV1DetailedRow(raw({
    rrdId: 201, reportId: 8001, retailAmount: String(account2ReportRetail),
  })), "2")],
  controls: [{ marketplace_account_id: 2, report_id: 8001, date_from: "2026-09-14",
    date_to: "2026-09-20", retail_amount_sum: account2ReportRetail }],
  from: "2026-09-14", to: "2026-09-20",
});
assert.ok(!account2Fixture.reasons.some((reason) => reason.startsWith("REPORT_RECONCILIATION_MISMATCH")));
assert.equal(account2Fixture.amountKopeks, null);

const incomplete = assessFinanceTaxableRevenueEvidence({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 15), rows: [evidence(normalized)],
  controls: [{ ...controls[0], date_to: "2026-09-18" }],
  from: "2026-09-14", to: "2026-09-20",
});
assert.equal(incomplete.status, "PARTIAL");
assert.ok(incomplete.reasons.some((reason) => reason.startsWith("FINANCE_COVERAGE_INCOMPLETE")));

const incomeOnly = assessFinanceTaxableRevenueEvidence({
  profile: profile("USN_INCOME", 6), rows: [evidence(normalized)], controls,
  from: "2026-09-14", to: "2026-09-20",
});
assert.equal(incomeOnly.status, "UNAVAILABLE");
assert.deepEqual(incomeOnly.reasons, ["PROVIDER_NOT_ENABLED_FOR_TAX_REGIME"]);

const customRate = calculateTaxYtd({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 13.5),
  income: { status: "VERIFIED", amountKopeks: 100_000 },
  deductibleExpensesKopeks: 40_000, expensesReady: true, isFinalAnnualPeriod: false,
});
assert.equal(customRate.calculatedTaxKopeks, 8_100);
const incomeSix = calculateTaxYtd({
  profile: profile("USN_INCOME", 6), income: { status: "VERIFIED", amountKopeks: 100_000 },
  deductibleExpensesKopeks: 90_000, expensesReady: true, isFinalAnnualPeriod: false,
});
assert.equal(incomeSix.calculatedTaxKopeks, 6_000);

let dbCalled = false;
const scopeFailure = await persistFinanceTransactionEvidence({
  db: { from() { dbCalled = true; throw new Error("must not call DB"); } },
  accountId: "1", rows: [{ ...sale, marketplace_account_id: "2" }],
});
assert.equal(dbCalled, false);
assert.equal(scopeFailure.persisted, 0);
assert.match(scopeFailure.errors[0], /account scope mismatch/);

const migration = readFileSync(resolve("supabase/migrations/20260924133347_tax_engine_v1_finance_transaction_evidence.sql"), "utf8");
assert.match(migration, /UNIQUE \(marketplace_account_id, rrd_id\)/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /TO service_role/);
assert.doesNotMatch(migration, /GRANT SELECT[^;]+authenticated/i);
assert.match(migration, /FINANCE_LEASE_LOST/);
assert.match(migration, /IF p_owner IS NOT NULL THEN/);

console.log("PASS Tax Engine V1 Sprint 3A evidence, gating, rates, isolation and migration assertions");
