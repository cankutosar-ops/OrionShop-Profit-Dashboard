import assert from "node:assert/strict";
import { calculateTaxYtd, selectedPeriodTaxImpact, unverifiedTaxableIncomeProvider } from "../src/lib/tax-engine/calculator.ts";
import { companyExpenseRule, COMPANY_EXPENSE_RULES } from "../src/lib/tax-engine/category-rules.ts";
import { classifyFinanceTaxExpense, classifyAdTaxExpense, summarizeMarketplaceTaxExpenses, PRODUCT_COST_TAX_RULE } from "../src/lib/tax-engine/marketplace-expenses.ts";
import { validateManualExpense } from "../src/services/company-expense-service.ts";
import { parseTaxModel, resolveTaxProfile } from "../src/services/tax-profile-service.ts";

const profile = (tax_object, tax_rate, effective_from = "2026-01-01", effective_to = null) => ({
  id: "1", company_id: "1", tax_system: "USN", tax_object, tax_rate,
  minimum_tax_rate: 1, effective_from, effective_to, region_code: null,
  vat_status: "UNKNOWN", created_at: "", updated_at: "",
});
const income = (amountKopeks) => ({ status: "VERIFIED", amountKopeks });
const calc = (p, i, e = 0, final = false) => calculateTaxYtd({
  profile: p, income: income(i), deductibleExpensesKopeks: e,
  expensesReady: true, isFinalAnnualPeriod: final,
});

assert.deepEqual(parseTaxModel({ model: "USN_INCOME" }), { taxObject: "USN_INCOME", rate: 6 });
assert.deepEqual(parseTaxModel({ model: "USN_INCOME_MINUS_EXPENSES" }), { taxObject: "USN_INCOME_MINUS_EXPENSES", rate: 15 });
assert.deepEqual(parseTaxModel({ model: "CUSTOM", customObject: "USN_INCOME", customRate: 4.5 }), { taxObject: "USN_INCOME", rate: 4.5 });
assert.deepEqual(parseTaxModel({ model: "CUSTOM", customObject: "USN_INCOME", customRate: 4.37 }), { taxObject: "USN_INCOME", rate: 4.37 });
assert.throws(() => parseTaxModel({ model: "CUSTOM", customRate: 4.5 }));
assert.equal(resolveTaxProfile([profile("USN_INCOME", 6, "2026-01-01", "2026-12-31"), profile("USN_INCOME_MINUS_EXPENSES", 15, "2027-01-01")], "2027-01-01")?.tax_rate, 15);

assert.equal(calc(profile("USN_INCOME", 6), 100_00, 90_00).estimatedTaxYtdKopeks, 600);
assert.equal(calc(profile("USN_INCOME", 4.5), 100_00).estimatedTaxYtdKopeks, 450);
assert.equal(calc(profile("USN_INCOME_MINUS_EXPENSES", 15), 100_00, 40_00).taxBaseKopeks, 60_00);
assert.equal(calc(profile("USN_INCOME_MINUS_EXPENSES", 15), 100_00, 40_00).estimatedTaxYtdKopeks, 900);
assert.equal(calc(profile("USN_INCOME_MINUS_EXPENSES", 15), 100_00, 150_00).estimatedTaxYtdKopeks, 0);
assert.equal(calc(profile("USN_INCOME_MINUS_EXPENSES", 15), 100_00, 150_00).minimumTaxReferenceKopeks, 100);
assert.equal(calc(profile("USN_INCOME_MINUS_EXPENSES", 15), 100_00, 150_00, true).estimatedTaxYtdKopeks, 100);
assert.equal(selectedPeriodTaxImpact(calc(profile("USN_INCOME", 6), 200_00), calc(profile("USN_INCOME", 6), 150_00)), -300);
assert.equal(calculateTaxYtd({ profile: null, income: income(0), deductibleExpensesKopeks: 0, expensesReady: true, isFinalAnnualPeriod: false }).readiness, "TAX_PROFILE_MISSING");
assert.equal(calculateTaxYtd({ profile: profile("USN_INCOME", 6), income: await unverifiedTaxableIncomeProvider.getYtdIncome("1", "2026-09-24"), deductibleExpensesKopeks: 0, expensesReady: false, isFinalAnnualPeriod: false }).estimatedTaxYtdKopeks, null);

assert.equal(COMPANY_EXPENSE_RULES.length, 13);
assert.equal(companyExpenseRule("FINES_PENALTIES")?.defaultDecision, "NO");
assert.equal(companyExpenseRule("ACCOUNTING")?.defaultDecision, "REVIEW");
const baseExpense = { expenseDate: "2026-09-24", category: "ACCOUNTING", description: "Service", amount: 100,
  taxDeductible: true, userOverrode: false };
assert.equal(validateManualExpense(baseExpense).tax_deductible_origin, "CATEGORY_DEFAULT");
assert.equal(validateManualExpense({ ...baseExpense, taxDeductible: false, userOverrode: true }).tax_deductible, false);
assert.equal(validateManualExpense({ ...baseExpense, category: "OTHER", taxDeductible: true, userOverrode: true }).tax_deductible, true);
assert.throws(() => validateManualExpense({ ...baseExpense, amount: -1 }));
assert.throws(() => validateManualExpense({ ...baseExpense, expenseDate: "2026-02-30" }));

const financeRow = (id, suffix, amount, account = "1") => ({ id: String(id), marketplace_account_id: account,
  source_key: `rrd:${id}:${suffix}`, wb_source_suffix: suffix, operation_date: "2026-09-24", amount });
const lines = [
  classifyFinanceTaxExpense(financeRow(1, "commission", 12)),
  classifyFinanceTaxExpense(financeRow(2, "logistics", -2)),
  classifyFinanceTaxExpense(financeRow(3, "for_pay", 100)),
  classifyFinanceTaxExpense(financeRow(4, "penalty", 3)),
  classifyFinanceTaxExpense(financeRow(5, "additional_payment", 5)),
  classifyFinanceTaxExpense(financeRow(6, "deduction", 8)),
  classifyAdTaxExpense({ id: "7", marketplace_account_id: "1", source_key: "adv:7", campaign_date: "2026-09-24", spend: 10 }),
];
assert.equal(lines[0].decision, "REVIEW");
assert.equal(lines[2].decision, "AUTO_NO");
assert.equal(PRODUCT_COST_TAX_RULE.recognition, "UNVERIFIED");
const summary = summarizeMarketplaceTaxExpenses([...lines, lines[0]], ["1", "1"], "2026-09-01", "2026-09-30");
assert.equal(summary.totalBusinessKopeks, 2300);
assert.equal(summary.deductibleKopeks, 0);
assert.equal(summary.reviewKopeks, 3100);
assert.equal(summary.lines.length, 7);
const proven = summarizeMarketplaceTaxExpenses([
  { ...lines[0], decision: "AUTO_YES", signedAmountKopeks: 1200 },
  { ...lines[3], decision: "AUTO_NO", signedAmountKopeks: 300 },
], ["1"], "2026-09-01", "2026-09-30");
assert.equal(proven.deductibleKopeks, 1200);
assert.equal(proven.nonDeductibleKopeks, 300);
assert.throws(() => summarizeMarketplaceTaxExpenses([classifyFinanceTaxExpense(financeRow(8, "commission", 1, "2"))], ["1"], "2026-09-01", "2026-09-30"));
console.log("Tax Engine V1 foundation assertions passed");
