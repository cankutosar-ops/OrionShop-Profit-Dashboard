/**
 * Presentation-only cost breakdown for Smart Pricing expandable row detail.
 * Reads existing Model B / after-tax engine output — does not change mathematics.
 */
import {
  buildModelBUnitMetrics,
  buildSmartPricingAfterTaxMetrics,
  type SmartPricingComputedRow,
} from "@/lib/smart-pricing";
import { buildSolverInputsFromRow } from "@/lib/smart-pricing-simulator";

export type CostBreakdownRow = {
  key: string;
  label: string;
  amount: number;
  /** Shown for Commission, Advertising, Estimated Tax when meaningful. */
  percent: number | null;
  /** Optional visual group for the expandable detail. */
  section?: "marketplace" | "logistics" | "other";
};

export type SmartPricingCostBreakdown = {
  title: string;
  rows: CostBreakdownRow[];
};

const AMOUNT_EPS = 0.01;

function isPresent(amount: number): boolean {
  return Number.isFinite(amount) && Math.abs(amount) > 1e-9;
}

/**
 * Cost lines at current ASP (fallback: recommended price).
 * Amounts come from existing Model B unit metrics (and matching row logistics inputs) only.
 *
 * Smart Pricing Model B folds Sales API marketplace fees into Commission;
 * Acquiring / Penalties / Adjustments are engine fields (usually 0 at unit level).
 * PPVZ Reward / PPVZ VW are not exposed on the unit-level Smart Pricing path — omitted (no assumptions).
 */
export function buildSmartPricingCostBreakdown(
  row: SmartPricingComputedRow,
  marketingPercent: number,
  taxPercent: number
): SmartPricingCostBreakdown | null {
  const solver = buildSolverInputsFromRow(row);
  if (solver === null) return null;

  const evalPrice =
    row.currentAvgPrice !== null &&
    Number.isFinite(row.currentAvgPrice) &&
    row.currentAvgPrice > 0
      ? row.currentAvgPrice
      : row.targetPrice !== null && row.targetPrice > 0
        ? row.targetPrice
        : null;

  if (evalPrice === null) return null;

  const modelB = buildModelBUnitMetrics(
    solver,
    marketingPercent,
    evalPrice,
    taxPercent
  );
  const afterTax = buildSmartPricingAfterTaxMetrics(
    solver,
    marketingPercent,
    taxPercent,
    evalPrice
  );

  const commissionPercent =
    modelB.netSales > 0 ? (modelB.commission / modelB.netSales) * 100 : null;
  const advertisingPercent =
    modelB.netSales > 0 ? (modelB.advertising / modelB.netSales) * 100 : null;
  const taxRatePercent =
    modelB.customerPaid > 0
      ? (afterTax.tax / modelB.customerPaid) * 100
      : taxPercent > 0
        ? taxPercent
        : null;

  const rows: CostBreakdownRow[] = [
    {
      key: "commission",
      label: "Commission",
      amount: modelB.commission,
      percent: commissionPercent,
      section: "marketplace",
    },
  ];

  if (isPresent(modelB.acquiring)) {
    rows.push({
      key: "acquiring",
      label: "Acquiring",
      amount: modelB.acquiring,
      percent: null,
      section: "marketplace",
    });
  }

  const forward = row.unitOutboundLogistics;
  const returnLogistics = row.unitRebillLogistics;
  const logisticsSplitMatchesEngine =
    Number.isFinite(forward) &&
    Number.isFinite(returnLogistics) &&
    Math.abs(forward + returnLogistics - modelB.logistics) <= AMOUNT_EPS;

  if (logisticsSplitMatchesEngine) {
    rows.push({
      key: "forwardLogistics",
      label: "Forward Logistics",
      amount: forward,
      percent: null,
      section: "logistics",
    });
    if (isPresent(returnLogistics)) {
      rows.push({
        key: "returnLogistics",
        label: "Return Logistics",
        amount: returnLogistics,
        percent: null,
        section: "logistics",
      });
    }
  } else {
    rows.push({
      key: "logistics",
      label: "Logistics",
      amount: modelB.logistics,
      percent: null,
      section: "logistics",
    });
  }

  rows.push({
    key: "storage",
    label: "Storage",
    amount: modelB.storage,
    percent: null,
    section: "other",
  });

  if (isPresent(modelB.penalties)) {
    rows.push({
      key: "penalties",
      label: "Penalties",
      amount: modelB.penalties,
      percent: null,
      section: "other",
    });
  }
  if (isPresent(modelB.adjustments)) {
    rows.push({
      key: "adjustments",
      label: "Adjustments",
      amount: modelB.adjustments,
      percent: null,
      section: "other",
    });
  }

  rows.push(
    {
      key: "estimatedTax",
      label: "Estimated Tax",
      amount: afterTax.tax,
      percent: taxRatePercent,
      section: "other",
    },
    {
      key: "productCost",
      label: "Product Cost",
      amount: modelB.productCost,
      percent: null,
      section: "other",
    },
    {
      key: "advertising",
      label: "Advertising",
      amount: modelB.advertising,
      percent: advertisingPercent,
      section: "other",
    }
  );

  return {
    title: row.supplierArticle,
    rows,
  };
}
