import assert from "node:assert/strict";
import fs from "node:fs";
import { calculateTaxYtd } from "../src/lib/tax-engine/calculator.ts";
import { summarizeOperatingExpenses } from "../src/lib/tax-engine/operating-expenses.ts";
import {
  classifyFinanceTaxExpense,
  summarizeMarketplaceTaxExpenses,
} from "../src/lib/tax-engine/marketplace-expenses.ts";
import { parseTaxModel, parseVatStatus } from "../src/services/tax-profile-service.ts";

const profile = (taxObject, rate, vatStatus = "EXEMPT") => ({
  id: "1", company_id: "1", tax_system: "USN", tax_object: taxObject,
  tax_rate: rate, minimum_tax_rate: 1, effective_from: "2026-01-01",
  effective_to: null, region_code: null, vat_status: vatStatus,
  created_at: "", updated_at: "",
});

const calc = (taxProfile, income, expenses, final = false) => calculateTaxYtd({
  profile: taxProfile, income, deductibleExpensesKopeks: expenses,
  expensesReady: true, isFinalAnnualPeriod: final,
});

assert.equal(calc(null, { status: "VERIFIED", amountKopeks: 100_00 }, 0).readiness, "TAX_PROFILE_MISSING");
assert.equal(calc(profile("USN_INCOME_MINUS_EXPENSES", 13.5),
  { status: "UNVERIFIED", amountKopeks: null }, 20_00).estimatedTaxYtdKopeks, null);
const custom = calc(profile("USN_INCOME_MINUS_EXPENSES", 13.5),
  { status: "VERIFIED", amountKopeks: 100_00 }, 20_00);
assert.equal(custom.taxBaseKopeks, 80_00);
assert.equal(custom.estimatedTaxYtdKopeks, 10_80);
const incomeOnly = calc(profile("USN_INCOME", 6),
  { status: "VERIFIED", amountKopeks: 100_00 }, 99_00);
assert.equal(incomeOnly.taxBaseKopeks, 100_00);
assert.equal(incomeOnly.estimatedTaxYtdKopeks, 6_00);
const annual = calc(profile("USN_INCOME_MINUS_EXPENSES", 13.5),
  { status: "VERIFIED", amountKopeks: 100_00 }, 100_00, true);
assert.equal(annual.minimumTaxReferenceKopeks, 1_00);
assert.equal(annual.estimatedTaxYtdKopeks, 1_00);
assert.equal(parseTaxModel({ model: "CUSTOM", customObject: "USN_INCOME_MINUS_EXPENSES", customRate: 13.5 }).rate, 13.5);
assert.equal(parseVatStatus(undefined), "UNKNOWN");
assert.equal(parseVatStatus("EXEMPT"), "EXEMPT");
assert.throws(() => parseVatStatus("NO_VAT"));

const expense = (overrides = {}) => ({
  id: "1", company_id: "1", expense_date: "2026-09-10", category: "ACCOUNTING",
  description: "Accounting", amount: 100, tax_deductible: true,
  category_default: true, tax_deductible_origin: "CATEGORY_DEFAULT",
  evidence_status: "UNVERIFIED", document_reference: null,
  payment_status: "UNVERIFIED", payment_date: null, paid_amount: 0,
  payment_reference: null, created_by: null, updated_by: null,
  created_at: "", updated_at: "", deleted_at: null, ...overrides,
});
const operating = summarizeOperatingExpenses([
  expense(),
  expense({ id: "2", amount: 200, tax_deductible_origin: "USER_OVERRIDE" }),
  expense({ id: "3", amount: 300, evidence_status: "VERIFIED", document_reference: "invoice-3",
    payment_status: "PAID", payment_date: "2026-09-11", paid_amount: 300,
    payment_reference: "bank-3" }),
  expense({ id: "4", amount: 50, tax_deductible: false }),
], "1", "2026-09-01", "2026-09-30");
assert.equal(operating.claimedDeductibleKopeks, 600_00);
assert.equal(operating.recognizedKopeks, 300_00);
assert.equal(operating.reviewKopeks, 200_00);
assert.equal(operating.unverifiedKopeks, 100_00);
assert.equal(operating.excludedKopeks, 50_00);
assert.throws(() => summarizeOperatingExpenses([expense({ company_id: "2" })], "1", "2026-09-01", "2026-09-30"));

const finance = (id, suffix, sourceKey = `rrd:${id}:${suffix}`) => ({
  id: String(id), marketplace_account_id: "1", source_key: sourceKey,
  wb_source_suffix: suffix, operation_date: "2026-09-10", amount: 10,
});
const marketplace = summarizeMarketplaceTaxExpenses([
  classifyFinanceTaxExpense(finance(1, "commission")),
  classifyFinanceTaxExpense(finance(2, "mystery_component")),
  classifyFinanceTaxExpense(finance(3, "for_pay")),
], ["1"], "2026-09-01", "2026-09-30");
assert.equal(marketplace.recognizedKopeks, 0);
assert.equal(marketplace.reviewKopeks, 10_00);
assert.equal(marketplace.unverifiedKopeks, 10_00);
assert.equal(marketplace.excludedKopeks, 10_00);
assert.throws(() => summarizeMarketplaceTaxExpenses([
  classifyFinanceTaxExpense({ ...finance(4, "commission"), marketplace_account_id: "2" }),
], ["1"], "2026-09-01", "2026-09-30"));

const migration = fs.readFileSync("supabase/migrations/20260924151145_tax_engine_v1_final_completion.sql", "utf8");
for (const fragment of ["ADD COLUMN IF NOT EXISTS status", "ADD COLUMN IF NOT EXISTS default_tax_percent",
  "document_reference", "payment_status", "p_vat_status", "VAT_APPLICABLE"]) {
  assert.ok(migration.includes(fragment), `migration missing ${fragment}`);
}

console.log("Tax Engine V1 final completion assertions passed");
