import assert from "node:assert/strict";
import { calculateTaxYtd } from "../src/lib/tax-engine/calculator.ts";
import { calculateModelBNetProfit } from "../src/lib/profit-engine-model-b.ts";

const profile = (tax_object, tax_rate) => ({
  id: "1",
  company_id: "1",
  tax_system: "USN",
  tax_object,
  tax_rate,
  minimum_tax_rate: 1,
  effective_from: "2026-01-01",
  effective_to: null,
  region_code: null,
  vat_status: "EXEMPT",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const income = { status: "VERIFIED", amountKopeks: 100_000 };
const six = calculateTaxYtd({
  profile: profile("USN_INCOME", 6),
  income,
  deductibleExpensesKopeks: 40_000,
  expensesReady: true,
  isFinalAnnualPeriod: false,
});
assert.equal(six.taxBaseKopeks, 100_000);
assert.equal(six.estimatedTaxYtdKopeks, 6_000);

const fifteen = calculateTaxYtd({
  profile: profile("USN_INCOME_MINUS_EXPENSES", 15),
  income,
  deductibleExpensesKopeks: 40_000,
  expensesReady: true,
  isFinalAnnualPeriod: false,
});
assert.equal(fifteen.taxBaseKopeks, 60_000);
assert.equal(fifteen.estimatedTaxYtdKopeks, 9_000);

const metrics = calculateModelBNetProfit({
  grossSales: 1_000,
  returnedSales: 0,
  netSales: 1_000,
  netSalesStatus: "ready",
  salesForPay: 800,
  financeNetForPay: 700,
  acquiring: 0,
  logistics: 100,
  storage: 0,
  penalties: 0,
  adjustments: 0,
  acceptance: 0,
  productCost: 200,
  advertising: 100,
  customerPaid: 1_000,
  taxPercent: 15,
  taxObject: "USN_INCOME_MINUS_EXPENSES",
  taxCalculationStatus: "READY",
  taxBase: 600,
  taxDeductibleExpenses: 400,
  estimatedTaxOverride: 90,
});

assert.equal(metrics.operatingProfit, 300);
assert.equal(metrics.estimatedTax, 90);
assert.equal(metrics.finalNetProfit, 210);
assert.equal(metrics.taxBase, 600);
assert.equal(metrics.taxDeductibleExpenses, 400);

console.log("Dashboard Tax Engine profile integration assertions passed");
