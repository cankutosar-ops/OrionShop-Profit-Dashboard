import type { ModelBProfitMetrics, ScopedDateRange } from "@/types/database";

// Explicit owner decision, 2026-10-13: Günay dashboard income-minus-expenses
// estimate. This does not certify VAT, payment evidence, or statutory tax returns.
export function applyOwnerApprovedDashboardTax(scope: ScopedDateRange, model: ModelBProfitMetrics): ModelBProfitMetrics {
  if (scope.companyId !== "3" || scope.marketplaceAccountId !== "6" ||
      model.taxObject !== "USN_INCOME_MINUS_EXPENSES" || model.taxPercent !== 15 ||
      model.netSalesStatus !== "ready") return model;
  const base = Math.max(0, model.operatingProfit);
  const tax = Math.round(base * model.taxPercent) / 100;
  return { ...model, taxCalculationStatus: "OWNER_APPROVED_ESTIMATE", taxBase: base,
    estimatedTax: tax, afterTaxPayout: model.sellerPayout - tax,
    finalNetProfit: model.operatingProfit - tax,
    taxReadinessReasons: ["Owner-approved management estimate; statutory VAT and deductible-expense evidence remain separate."] };
}

export function dashboardTaxExplanation(model: ModelBProfitMetrics): string {
  if (model.taxCalculationStatus === "OWNER_APPROVED_ESTIMATE")
    return `Owner-approved estimate: ${model.taxPercent}% × max(0, Operating Profit). Marketplace charges already reflected in Revenue are not deducted twice. This is not a statutory tax return.`;
  if (model.taxObject === "USN_INCOME_MINUS_EXPENSES")
    return `Company income-minus-expenses tax estimate from Tax Engine, at ${model.taxPercent}%; cumulative period impact.`;
  return `Estimated Tax = ${model.taxPercent}% × net stored Sales finishedPrice.`;
}
