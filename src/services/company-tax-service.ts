import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTaxYtd, unverifiedTaxableIncomeProvider, type TaxReadiness } from "@/lib/tax-engine/calculator";
import {
  classifyAdTaxExpense, classifyFinanceTaxExpense, summarizeMarketplaceTaxExpenses,
} from "@/lib/tax-engine/marketplace-expenses";
import { listCompanyExpenses } from "@/services/company-expense-service";
import { listCompanyTaxProfiles, resolveTaxProfile } from "@/services/tax-profile-service";
import type { WbAd, WbFinance } from "@/types/database";

async function allPages<T>(queryForPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await queryForPage(offset, offset + 499);
    if (error) throw new Error(`Tax source read failed: ${error.message}`);
    result.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) return result;
  }
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
      allPages<WbFinance>((start, end) => db.from("wb_finance").select("*")
        .eq("marketplace_account_id", accountId).gte("operation_date", from).lte("operation_date", to)
        .order("id").range(start, end)),
      allPages<WbAd>((start, end) => db.from("wb_ads").select("*")
        .eq("marketplace_account_id", accountId).gte("campaign_date", from).lte("campaign_date", to)
        .order("id").range(start, end)),
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
  const manualTotalKopeks = manualExpenses.reduce((sum, e) => sum + Math.round(Number(e.amount) * 100), 0);
  // Checkbox is a claim, not documentation/payment evidence. Do not promote to confirmed tax deduction.
  const manualClaimedKopeks = manualExpenses.reduce((sum, e) =>
    sum + (e.tax_deductible ? Math.round(Number(e.amount) * 100) : 0), 0);
  const profile = resolveTaxProfile(profiles, to);
  const income = await unverifiedTaxableIncomeProvider.getYtdIncome(companyId, to);
  const calculation = calculateTaxYtd({
    profile, income, deductibleExpensesKopeks: 0, expensesReady: false,
    isFinalAnnualPeriod: false,
  });
  const readinessSignals: TaxReadiness[] = [calculation.readiness];
  if (profile?.tax_object === "USN_INCOME_MINUS_EXPENSES") {
    readinessSignals.push("PURCHASE_COST_UNVERIFIED");
    if (marketplace.reviewKopeks !== 0 || manualClaimedKopeks !== 0) readinessSignals.push("REVIEW_EXPENSES");
  }
  return {
    companyId, from, to, accountIds, profile, profiles,
    taxableIncome: income, calculation, readinessSignals,
    manual: { totalKopeks: manualTotalKopeks, claimedPendingEvidenceKopeks: manualClaimedKopeks,
      verifiedDeductibleKopeks: 0, count: manualExpenses.length },
    marketplace,
    purchases: { count: purchaseCount, recognition: "UNVERIFIED" as const,
      taxDeductibleKopeks: null },
    warnings: [
      "Taxable income source is unverified; no tax amount is published.",
      ...(purchaseCount ? ["Purchase payment and resale allocation are unverified."] : []),
      ...(marketplace.reviewKopeks !== 0 ? ["Marketplace expenses require payment/direction review."] : []),
      ...(manualClaimedKopeks !== 0 ? ["Manual deductible claims require payment/document evidence."] : []),
    ],
  };
}
