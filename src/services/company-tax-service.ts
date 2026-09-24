import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTaxYtd, unverifiedTaxableIncomeProvider, type TaxReadiness } from "@/lib/tax-engine/calculator";
import {
  classifyAdTaxExpense, classifyFinanceTaxExpense, summarizeMarketplaceTaxExpenses,
} from "@/lib/tax-engine/marketplace-expenses";
import { listCompanyExpenses } from "@/services/company-expense-service";
import { listCompanyTaxProfiles, resolveTaxProfile } from "@/services/tax-profile-service";
import type { WbAd, WbFinance } from "@/types/database";
import { loadCompanyFinanceTaxableRevenueEvidence } from "@/lib/tax-engine/finance-transaction-evidence";
import { getCompanyPurchaseRecognition } from "@/services/purchase-tax-recognition-service";
import { summarizeOperatingExpenses } from "@/lib/tax-engine/operating-expenses";

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
