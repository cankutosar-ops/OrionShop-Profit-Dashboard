import type { CompanyTaxProfile } from "@/types/database";

export type TaxReadiness =
  | "READY" | "TAX_PROFILE_MISSING" | "TAXABLE_INCOME_SOURCE_UNVERIFIED"
  | "PURCHASE_COST_UNVERIFIED" | "REVIEW_EXPENSES" | "INCOMPLETE_SOURCE_DATA";

export type TaxableIncomeInput = {
  status: "VERIFIED" | "PARTIAL" | "UNVERIFIED" | "UNAVAILABLE" | "INCOMPLETE";
  /** Signed cumulative amount in integer kopeks. Null unless verified. */
  amountKopeks: number | null;
  sourceVersion?: string;
};

export interface TaxableIncomeProvider {
  getYtdIncome(companyId: string, asOfDate: string): Promise<TaxableIncomeInput>;
}

/** No current persisted WB field proves gross tax receipts and effective date. */
export const unverifiedTaxableIncomeProvider: TaxableIncomeProvider = {
  async getYtdIncome() {
    return { status: "UNVERIFIED", amountKopeks: null };
  },
};

export type TaxCalculation = {
  readiness: TaxReadiness;
  taxBaseKopeks: number | null;
  calculatedTaxKopeks: number | null;
  minimumTaxReferenceKopeks: number | null;
  estimatedTaxYtdKopeks: number | null;
  annualMinimumApplied: boolean;
  warnings: string[];
};

function assertKopeks(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error("Money must be safe integer kopeks");
}

function rateToBasisPoints(rate: number): number {
  const bps = Math.round(rate * 100);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100 || Math.abs(bps / 100 - rate) > 1e-9) {
    throw new Error("Tax rate must be 0.01–100% with at most two decimals");
  }
  return bps;
}

function taxAtRate(amountKopeks: number, rate: number): number {
  const numerator = BigInt(amountKopeks) * BigInt(rateToBasisPoints(rate));
  const result = Number((numerator + BigInt(5000)) / BigInt(10000));
  assertKopeks(result);
  return result;
}

export function calculateTaxYtd(input: {
  profile: CompanyTaxProfile | null;
  income: TaxableIncomeInput;
  deductibleExpensesKopeks: number;
  expensesReady: boolean;
  isFinalAnnualPeriod: boolean;
}): TaxCalculation {
  const unavailable = (readiness: TaxReadiness, warning: string): TaxCalculation => ({
    readiness, taxBaseKopeks: null, calculatedTaxKopeks: null,
    minimumTaxReferenceKopeks: null, estimatedTaxYtdKopeks: null,
    annualMinimumApplied: false, warnings: [warning],
  });
  if (!input.profile) return unavailable("TAX_PROFILE_MISSING", "Company tax profile is not configured.");
  if (input.income.status !== "VERIFIED" || input.income.amountKopeks === null) {
    return unavailable(
      input.income.status === "INCOMPLETE" ? "INCOMPLETE_SOURCE_DATA" : "TAXABLE_INCOME_SOURCE_UNVERIFIED",
      "Gross taxable income and recognition date are not verified."
    );
  }
  assertKopeks(input.income.amountKopeks);
  assertKopeks(input.deductibleExpensesKopeks);
  if (input.profile.tax_object === "USN_INCOME_MINUS_EXPENSES" && !input.expensesReady) {
    return unavailable("REVIEW_EXPENSES", "Deductible expense evidence is incomplete.");
  }
  const income = Math.max(0, input.income.amountKopeks);
  const base = input.profile.tax_object === "USN_INCOME"
    ? income : Math.max(0, input.income.amountKopeks - input.deductibleExpensesKopeks);
  const ordinary = taxAtRate(base, input.profile.tax_rate);
  const minimum = input.profile.tax_object === "USN_INCOME_MINUS_EXPENSES"
    ? taxAtRate(income, input.profile.minimum_tax_rate) : null;
  const annualMinimumApplied = Boolean(input.isFinalAnnualPeriod && minimum !== null && minimum > ordinary);
  return {
    readiness: "READY", taxBaseKopeks: base, calculatedTaxKopeks: ordinary,
    minimumTaxReferenceKopeks: minimum,
    estimatedTaxYtdKopeks: annualMinimumApplied ? minimum : ordinary,
    annualMinimumApplied,
    warnings: input.profile.tax_object === "USN_INCOME"
      ? ["Estimate before any eligible insurance-contribution reduction."]
      : input.isFinalAnnualPeriod ? [] : ["The 1% annual minimum is a reference, not currently due."],
  };
}

/** Difference of cumulative estimates, not statutory payable tax. May be negative. */
export function selectedPeriodTaxImpact(startPriorYtd: TaxCalculation, endYtd: TaxCalculation): number | null {
  if (startPriorYtd.readiness !== "READY" || endYtd.readiness !== "READY" ||
    startPriorYtd.estimatedTaxYtdKopeks === null || endYtd.estimatedTaxYtdKopeks === null) return null;
  return endYtd.estimatedTaxYtdKopeks - startPriorYtd.estimatedTaxYtdKopeks;
}
