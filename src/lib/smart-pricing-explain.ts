import { formatRecommendedPriceFormula, verifyRecommendedPrice } from "@/lib/smart-pricing";
import type { SmartPricingComputedRow } from "@/lib/smart-pricing";
import { formatLogisticsSourceLabel } from "@/lib/smart-pricing-logistics";
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
  testPrice?: number | null
): SmartPricingExplainContent | null {
  if (row.purchaseCost === null) return null;

  const formula = formatRecommendedPriceFormula(
    {
      purchaseCost: row.purchaseCost,
      effectiveLogistics: row.effectiveLogistics,
      commissionPercent: row.commissionPercent,
    },
    targetMarginPercent,
    marketingPercent
  );

  const recommendedPrice =
    row.targetPrice !== null ? `${row.targetPrice.toFixed(2)} ₽` : "—";

  const sellingPrice =
    testPrice ?? row.targetPrice;
  const solver = buildSolverInputsFromRow(row);
  const simulation =
    solver !== null && sellingPrice !== null && sellingPrice > 0
      ? (() => {
          const { profit, marginPercent } = verifyRecommendedPrice(
            solver,
            targetMarginPercent,
            marketingPercent,
            sellingPrice
          );
          return [
            { label: "Selling Price", value: `${sellingPrice.toFixed(2)} ₽` },
            {
              label: "Commission",
              value: `${row.commissionPercent.toFixed(2)}% (${formatCommissionSourceLabel(row.commissionSource)})`,
            },
            { label: "Marketing", value: `${marketingPercent.toFixed(0)}%` },
            { label: "Purchase Cost", value: `${row.purchaseCost!.toFixed(2)} ₽` },
            {
              label: "Effective Logistics",
              value: `${row.effectiveLogistics.toFixed(2)} ₽ (${formatLogisticsSourceLabel(row.logisticsSource)}, ${row.logisticsCompletedUnits} units)`,
            },
            { label: "Expected Net Profit", value: `${profit.toFixed(2)} ₽` },
            { label: "Profit Margin", value: `${marginPercent.toFixed(1)}%` },
          ];
        })()
      : null;

  return {
    title: `Explain Price — ${row.supplierArticle}`,
    lines: [
      { label: "Purchase Cost", value: `${row.purchaseCost.toFixed(2)} ₽` },
      {
        label: "Effective Logistics",
        value: `${row.effectiveLogistics.toFixed(2)} ₽ (${formatLogisticsSourceLabel(row.logisticsSource)}, ${row.logisticsCompletedUnits} units)`,
      },
      {
        label: "Logistics Source",
        value: `${formatLogisticsSourceLabel(row.logisticsSource)} · ${row.logisticsCompletedUnits} completed units`,
      },
      {
        label: "Commission",
        value: `${row.commissionPercent.toFixed(2)}% (${formatCommissionSourceLabel(row.commissionSource)})`,
      },
      { label: "Marketing", value: `${marketingPercent.toFixed(0)}%` },
      { label: "Target Margin", value: `${targetMarginPercent.toFixed(0)}%` },
    ],
    formula,
    recommendedPrice,
    simulation,
  };
}
