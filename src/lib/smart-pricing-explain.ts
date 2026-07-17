import { formatRecommendedPriceFormula, verifyRecommendedPrice } from "@/lib/smart-pricing";
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

  const formula = formatRecommendedPriceFormula(
    solver,
    targetMarginPercent,
    marketingPercent,
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
            marketingPercent,
            sellingPrice,
            taxPercent
          );
          return [
            { label: "Selling Price", value: `${sellingPrice.toFixed(2)} ₽` },
            {
              label: "Resolution Source",
              value: formatHistoricalSourceLabel(row.resolutionSource),
            },
            {
              label: "Commission %",
              value: `${row.marketplaceFeesPercent.toFixed(2)}% (${formatCommissionSourceLabel(row.marketplaceFeesSource)})`,
            },
            {
              label: "Historical Logistics",
              value: `${row.historicalLogistics.toFixed(2)} ₽ (${formatHistoricalSourceLabel(row.resolutionSource)}, ${row.historicalCompletedUnits} units)`,
            },
            {
              label: "Storage",
              value: `${row.storagePerUnit.toFixed(2)} ₽ (${formatHistoricalSourceLabel(row.resolutionSource)})`,
            },
            { label: "Marketing", value: `${marketingPercent.toFixed(0)}%` },
            {
              label: "Tax (on Seller Payout)",
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
        value: formatHistoricalSourceLabel(row.resolutionSource),
      },
      {
        label: "Historical Logistics",
        value: `${row.historicalLogistics.toFixed(2)} ₽ (${formatHistoricalSourceLabel(row.resolutionSource)}, ${row.historicalCompletedUnits} units)`,
      },
      {
        label: "Storage",
        value: `${row.storagePerUnit.toFixed(2)} ₽ (${formatHistoricalSourceLabel(row.resolutionSource)})`,
      },
      {
        label: "Commission %",
        value: `${row.marketplaceFeesPercent.toFixed(2)}% (${formatCommissionSourceLabel(row.marketplaceFeesSource)})`,
      },
      { label: "Marketing", value: `${marketingPercent.toFixed(0)}%` },
      { label: "Tax (on Seller Payout)", value: `${taxPercent.toFixed(0)}%` },
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
