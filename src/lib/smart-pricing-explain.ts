import { formatRecommendedPriceFormula, resolveEffectiveMarketingPercent, verifyRecommendedPrice } from "@/lib/smart-pricing";
import type { SmartPricingComputedRow } from "@/lib/smart-pricing";
import { DEFAULT_TAX_PERCENT } from "@/lib/smart-pricing-constants";
import { formatHistoricalSourceLabel } from "@/lib/smart-pricing-historical-costs";
import { buildSolverInputsFromRow } from "@/lib/smart-pricing-simulator";
import { formatCommissionSourceLabel } from "@/lib/smart-pricing-settings";

export type SmartPricingExplainContent = {
  title: string;
  lines: { label: string; value: string }[];
  formula: string;
  recommendedPrice: string;
  simulation: { label: string; value: string }[] | null;
};

export function buildSmartPricingExplainContent(
  row: SmartPricingComputedRow,
  targetMarginPercent: number,
  marketingPercent: number,
  taxPercent: number = DEFAULT_TAX_PERCENT,
  testPrice?: number | null
): SmartPricingExplainContent | null {
  if (row.purchaseCost === null) return null;

  const solver = buildSolverInputsFromRow(row);
  if (solver === null) return null;
  const effectiveMarketing = resolveEffectiveMarketingPercent(marketingPercent, row.recentAdvertisingPercent);
  const source = `${formatHistoricalSourceLabel(row.resolutionSource)} ${row.costWindowDays ?? 90}d`;

  const formula = formatRecommendedPriceFormula(
    solver,
    targetMarginPercent,
    effectiveMarketing,
    taxPercent
  );

  const recommendedPrice =
    row.targetPrice !== null ? `${row.targetPrice.toFixed(2)} ₽` : "—";

  const sellingPrice = testPrice ?? row.targetPrice;
  const simulation =
    sellingPrice !== null && sellingPrice > 0
      ? (() => {
          const { profit, marginPercent, operatingProfit, tax } = verifyRecommendedPrice(
            solver,
            targetMarginPercent,
            effectiveMarketing,
            sellingPrice,
            taxPercent
          );
          return [
            { label: "Selling Price", value: `${sellingPrice.toFixed(2)} ₽` },
            {
              label: "Resolution Source",
              value: source,
            },
            {
              label: "Fee assumption (Sales API spread)",
              value: `${row.marketplaceFeesPercent.toFixed(2)}% (${formatCommissionSourceLabel(row.marketplaceFeesSource)})`,
            },
            {
              label: "Historical Logistics",
              value: `${row.historicalLogistics.toFixed(2)} ₽ (${source}, ${row.historicalCompletedUnits} sales)`,
            },
            {
              label: "Storage",
              value: `${row.storagePerUnit.toFixed(2)} ₽ (${formatHistoricalSourceLabel(row.resolutionSource)})`,
            },
            { label: "Expected return burden", value: `${(row.expectedReturnBurden ?? 0).toFixed(2)} ₽ (within logistics)` },
            { label: "Ads", value: `${effectiveMarketing.toFixed(2)}% (manual floor ${marketingPercent.toFixed(2)}%, recent ${row.recentAdvertisingPercent?.toFixed(2) ?? "—"}%)` },
            {
              label: "Tax (after Sales-to-Settlement allowance)",
              value: `${taxPercent.toFixed(0)}% → ${tax.toFixed(2)} ₽`,
            },
            { label: "Purchase Cost", value: `${row.purchaseCost.toFixed(2)} ₽` },
            { label: "Operating Profit", value: `${operatingProfit.toFixed(2)} ₽` },
            { label: "Final Net Profit (after tax)", value: `${profit.toFixed(2)} ₽` },
            { label: "Final Margin %", value: `${marginPercent.toFixed(1)}%` },
          ];
        })()
      : null;

  return {
    title: `Explain Price — ${row.supplierArticle}`,
    lines: [
      { label: "Purchase Cost", value: `${row.purchaseCost.toFixed(2)} ₽` },
      {
        label: "Resolution Source",
        value: source,
      },
      { label: "Cost data through", value: row.costAsOfDate ?? "—" },
      {
        label: "Historical Logistics",
        value: `${row.historicalLogistics.toFixed(2)} ₽ (${source}, ${row.historicalCompletedUnits} sales)`,
      },
      { label: "Expected return burden", value: `${(row.expectedReturnBurden ?? 0).toFixed(2)} ₽ (within logistics; ${row.expectedReturnRatePercent?.toFixed(1) ?? "—"}% of cost-window sales returned)` },
      { label: "30d vs 90d logistics", value: row.recentLongLogisticsVariancePercent === null || row.recentLongLogisticsVariancePercent === undefined ? "—" : `${row.recentLongLogisticsVariancePercent.toFixed(1)}%` },
      {
        label: "Storage",
        value: `${row.storagePerUnit.toFixed(2)} ₽ (${formatHistoricalSourceLabel(row.resolutionSource)})`,
      },
      {
        label: "Fee assumption (Sales API spread)",
        value: `${row.marketplaceFeesPercent.toFixed(2)}% (${formatCommissionSourceLabel(row.marketplaceFeesSource)})`,
      },
      { label: "Ads", value: `${effectiveMarketing.toFixed(2)}% (manual floor ${marketingPercent.toFixed(2)}%, recent ${row.recentAdvertisingPercent?.toFixed(2) ?? "—"}%)` },
      { label: "Tax (after Sales-to-Settlement allowance)", value: `${taxPercent.toFixed(0)}%` },
      {
        label: "Target Margin (after tax)",
        value: `${targetMarginPercent.toFixed(0)}%`,
      },
    ],
    formula,
    recommendedPrice,
    simulation,
  };
}
