import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTaxYtd, unverifiedTaxableIncomeProvider, selectedPeriodTaxImpact, type TaxCalculation, type TaxReadiness } from "@/lib/tax-engine/calculator";
import {
  classifyAdTaxExpense, classifyFinanceTaxExpense, summarizeMarketplaceTaxExpenses,
} from "@/lib/tax-engine/marketplace-expenses";
import { listCompanyExpenses } from "@/services/company-expense-service";
import { listCompanyTaxProfiles, resolveTaxProfile } from "@/services/tax-profile-service";
import type { WbAd, WbFinance } from "@/types/database";
import { loadCompanyFinanceTaxableRevenueEvidence } from "@/lib/tax-engine/finance-transaction-evidence";
import { getCompanyPurchaseRecognition } from "@/services/purchase-tax-recognition-service";
import { summarizeOperatingExpenses } from "@/lib/tax-engine/operating-expenses";
import { fetchAllInDateRange } from "@/lib/supabase/paginate";

/** The dashboard's income-only estimate needs the profile, not an expense audit. */
export async function getDashboardTaxInputs(companyId: string, from: string, to: string,
  scope?: { marketplaceAccountId: string; brandId?: string }) {
  const profiles = await listCompanyTaxProfiles(companyId);
  const profile = resolveTaxProfile(profiles, to);
  if (profile?.tax_object !== "USN_INCOME_MINUS_EXPENSES") {
    return { profile, recognizedExpensesKopeks: 0, expensePeriodCalculation: undefined as TaxCalculation | undefined,
      expensePeriodReasons: [] as string[] };
  }
  const foundation = await getCompanyTaxFoundation(companyId, from, to).catch(() => null);
  if (!foundation) return { profile, recognizedExpensesKopeks: 0,
    expensePeriodCalculation: { readiness: "INCOMPLETE_SOURCE_DATA" as const, taxBaseKopeks: null,
      calculatedTaxKopeks: null, minimumTaxReferenceKopeks: null, estimatedTaxYtdKopeks: null,
      annualMinimumApplied: false, warnings: ["Company tax evidence is unavailable."] },
    expensePeriodReasons: ["Company tax evidence is unavailable."] };
  const yearStart = `${to.slice(0, 4)}-01-01`;
  const reasons = [...foundation.warnings];
  if (foundation.readinessSignals.some(signal => signal !== "READY")) reasons.push("Tax income or deductible expenses require verification.");
  if (profile.effective_from > yearStart || resolveTaxProfile(profiles, yearStart)?.id !== profile.id ||
      profiles.some(p => p.id !== profile.id && p.effective_from > yearStart && p.effective_from <= to)) {
    reasons.push("The effective tax profile does not cover the cumulative tax period.");
  }
  if (profile.vat_status === "UNKNOWN") reasons.push("Company VAT treatment is unverified.");
  if (from.slice(0, 4) !== to.slice(0, 4) || from > to) reasons.push("Select a valid range within one tax year.");
  if (scope && (scope.brandId || foundation.accountIds.length !== 1 || foundation.accountIds[0] !== scope.marketplaceAccountId)) {
    reasons.push("Company tax cannot be allocated to a brand or individual account without an explicit allocation policy.");
  }
  const blocked = (messages: string[]): TaxCalculation => ({ readiness: "INCOMPLETE_SOURCE_DATA",
    taxBaseKopeks: null, calculatedTaxKopeks: null, minimumTaxReferenceKopeks: null,
    estimatedTaxYtdKopeks: null, annualMinimumApplied: false, warnings: messages });
  let calculation = blocked(reasons);
  if (reasons.length === 0) {
    const end = from === yearStart ? foundation : await getCompanyTaxFoundation(companyId, yearStart, to);
    const priorDate = new Date(`${from}T00:00:00Z`); priorDate.setUTCDate(priorDate.getUTCDate() - 1);
    const prior = from === yearStart ? null : await getCompanyTaxFoundation(companyId, yearStart, priorDate.toISOString().slice(0, 10));
    const snapshots = [end, ...(prior ? [prior] : [])];
    const blockers = snapshots.flatMap(item => item.readinessSignals.filter(signal => signal !== "READY"));
    const zero: TaxCalculation = { readiness: "READY", taxBaseKopeks: 0, calculatedTaxKopeks: 0,
      minimumTaxReferenceKopeks: 0, estimatedTaxYtdKopeks: 0, annualMinimumApplied: false, warnings: [] };
    const impact = blockers.length ? null : selectedPeriodTaxImpact(prior?.calculation ?? zero, end.calculation);
    if (impact === null || impact < 0) {
      reasons.push(impact !== null && impact < 0 ? "A negative cumulative tax adjustment requires separate presentation."
        : "Cumulative tax income or expenses are unverified.");
      calculation = blocked(reasons);
    } else calculation = { ...end.calculation, estimatedTaxYtdKopeks: impact };
  }
  return { profile: foundation.profile, recognizedExpensesKopeks: foundation.recognizedExpensesKopeks,
    expensePeriodCalculation: calculation, expensePeriodReasons: reasons };
}

export async function getCompanyTaxFoundation(companyId: string, from: string, to: string) {
  const db = createAdminClient();
  const [{ data: accounts, error: accountError }, profiles, manualExpenses] = await Promise.all([
    db.from("marketplace_accounts").select("id").eq("company_id", companyId).order("id"),
    listCompanyTaxProfiles(companyId),
    listCompanyExpenses(companyId, from, to),
  ]);
  if (accountError) throw new Error(`Company accounts unavailable: ${accountError.message}`);
  const accountIds = [...new Set((accounts ?? []).map((a) => String(a.id)))];
  const finance: WbFinance[] = [];
  const ads: WbAd[] = [];
  let purchaseCount = 0;
  for (const accountId of accountIds) {
    const [financeRows, adRows, purchases] = await Promise.all([
      fetchAllInDateRange<WbFinance>(db, "wb_finance", {
        marketplaceAccountId: accountId, column: "operation_date", from, to,
      }),
      fetchAllInDateRange<WbAd>(db, "wb_ads", {
        marketplaceAccountId: accountId, column: "campaign_date", from, to,
      }),
      db.from("purchases").select("id", { count: "exact", head: true })
        .eq("marketplace_account_id", accountId).gte("purchase_date", from).lte("purchase_date", to),
    ]);
    if (purchases.error) throw new Error(`Purchase status unavailable: ${purchases.error.message}`);
    finance.push(...financeRows);
    ads.push(...adRows);
    purchaseCount += purchases.count ?? 0;
  }
  const marketplace = summarizeMarketplaceTaxExpenses(
    [...finance.map(classifyFinanceTaxExpense), ...ads.map(classifyAdTaxExpense)], accountIds, from, to
  );
  const operating = summarizeOperatingExpenses(manualExpenses, companyId, from, to);
  const profile = resolveTaxProfile(profiles, to);
  const [taxableRevenueEvidence, purchaseRecognition] = profile?.tax_object === "USN_INCOME_MINUS_EXPENSES"
    ? await Promise.all([
        loadCompanyFinanceTaxableRevenueEvidence({ db, profile, accountIds, from, to }),
        getCompanyPurchaseRecognition(companyId, to, from),
      ])
    : [null, null];
  const income = taxableRevenueEvidence
    ? {
        status: taxableRevenueEvidence.status,
        amountKopeks: taxableRevenueEvidence.amountKopeks,
        sourceVersion: taxableRevenueEvidence.source,
      }
    : await unverifiedTaxableIncomeProvider.getYtdIncome(companyId, to);
  const purchaseRecognizedKopeks = purchaseRecognition
    ? Math.round(purchaseRecognition.recognizedAmount * 100) : 0;
  const recognizedExpensesKopeks = marketplace.recognizedKopeks + operating.recognizedKopeks +
    purchaseRecognizedKopeks;
  const calculation = calculateTaxYtd({
    profile, income, deductibleExpensesKopeks: recognizedExpensesKopeks, expensesReady: true,
    isFinalAnnualPeriod: false,
  });
  const readinessSignals: TaxReadiness[] = [calculation.readiness];
  if (profile?.tax_object === "USN_INCOME_MINUS_EXPENSES") {
    if (!purchaseRecognition || purchaseRecognition.reconciliationRequired ||
      ["POLICY_UNCONFIGURED", "UNVERIFIED_FX", "VAT_BASIS_UNVERIFIED"].includes(purchaseRecognition.status)) {
      readinessSignals.push("PURCHASE_COST_UNVERIFIED");
    }
    if (marketplace.reviewKopeks !== 0 || marketplace.unverifiedKopeks !== 0 ||
      operating.reviewKopeks !== 0 || operating.unverifiedKopeks !== 0) {
      readinessSignals.push("REVIEW_EXPENSES");
    }
  }
  const expenseBlockerKopeks = marketplace.reviewKopeks + marketplace.unverifiedKopeks +
    operating.reviewKopeks + operating.unverifiedKopeks;
  return {
    companyId, from, to, accountIds, profile, profiles,
    taxableIncome: income, taxableRevenueEvidence, calculation, readinessSignals,
    operating,
    manual: { totalKopeks: operating.totalKopeks,
      claimedPendingEvidenceKopeks: operating.claimedDeductibleKopeks - operating.recognizedKopeks,
      verifiedDeductibleKopeks: operating.recognizedKopeks, count: operating.lines.length },
    marketplace,
    purchases: {
      count: purchaseCount,
      recognition: purchaseRecognition?.status ?? "NOT_APPLICABLE",
      taxDeductibleKopeks: purchaseRecognizedKopeks,
      provider: purchaseRecognition,
    },
    recognizedExpensesKopeks,
    calculationStatus: income.status !== "VERIFIED" ? "TAXABLE_INCOME_UNVERIFIED"
      : expenseBlockerKopeks !== 0 || purchaseRecognition?.reconciliationRequired
        ? "ESTIMATE_WITH_BLOCKERS" : "ESTIMATE_READY",
    warnings: [
      ...(income.status === "VERIFIED" ? [] : ["Taxable income source is unverified; no tax amount is published."]),
      ...(taxableRevenueEvidence?.reasons ?? []),
      ...(purchaseRecognition?.evidence.reasons ?? []),
      ...(marketplace.reviewKopeks !== 0 ? ["Marketplace expenses require payment/direction review."] : []),
      ...(marketplace.unverifiedKopeks !== 0 ? ["Marketplace components lack complete source evidence."] : []),
      ...(operating.reviewKopeks !== 0 || operating.unverifiedKopeks !== 0
        ? ["Operating expense claims require complete payment/document evidence."] : []),
    ],
  };
}
