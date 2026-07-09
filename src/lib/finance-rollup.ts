import {
  effectiveFinanceCategory,
  isMarketplaceServiceFeeCategory,
  profitOperationTypeForRow,
  type FinanceCategory,
} from "@/lib/finance-category";
import { calculateMarketplaceFeesFromParts } from "@/lib/profitability-v2";
import type { FinanceExpenseTotals } from "@/lib/profit-calculator";
import type { FinanceOperationType, WbFinance } from "@/types/database";
import { FINANCE_OPERATION_TYPES } from "@/types/database";

export type MarketplaceFeesPresentation = {
  /** Previous KPI: commission + all operation_type other. */
  legacyMarketplaceFees: number;
  /** Commission + acquiring / ppvz service fees only (excludes adjustments & reimbursements). */
  marketplaceServiceFees: number;
  /** Account-level deductions (Удержание / ADJUSTMENT category). */
  accountAdjustments: number;
  /** Reimbursements (COMPENSATION) — excluded from display, still in net profit via other. */
  reimbursements: number;
};

export type FinanceCategorySummary = Record<FinanceCategory, number>;

function zeroCategorySummary(): FinanceCategorySummary {
  return {
    COMMISSION: 0,
    ACQUIRING: 0,
    PPVZ_REWARD: 0,
    PPVZ_VW: 0,
    LOGISTICS: 0,
    RETURN_LOGISTICS: 0,
    STORAGE: 0,
    PENALTY: 0,
    ADJUSTMENT: 0,
    COMPENSATION: 0,
    OTHER: 0,
  };
}

/** Sum finance rows by persisted (or transitional) normalized category. */
export function summarizeFinanceByCategory(finance: WbFinance[]): FinanceCategorySummary {
  const summary = zeroCategorySummary();

  for (const row of finance) {
    const category = effectiveFinanceCategory(row);
    summary[category] += Math.abs(Number(row.amount));
  }

  return summary;
}

/**
 * Roll normalized categories into permanent operation_type profit buckets.
 * Pre-backfill rows without finance_category use operation_type directly for parity.
 */
export function rollupCategoriesToProfitBuckets(finance: WbFinance[]): FinanceExpenseTotals {
  const byType = FINANCE_OPERATION_TYPES.reduce(
    (acc, type) => {
      acc[type] = 0;
      return acc;
    },
    {} as Record<FinanceOperationType, number>
  );

  let unclassified = 0;

  for (const row of finance) {
    const opType = profitOperationTypeForRow(row);
    const amount = Math.abs(Number(row.amount));

    if (FINANCE_OPERATION_TYPES.includes(opType)) {
      byType[opType] += amount;
    } else {
      unclassified += amount;
    }
  }

  const total = FINANCE_OPERATION_TYPES.reduce((sum, type) => sum + byType[type], 0) + unclassified;

  return { ...byType, unclassified, total };
}

/**
 * Dashboard Marketplace Fees presentation from persisted categories.
 * Does not alter net profit — all other-bucket amounts remain in otherExpenses.
 */
export function buildMarketplaceFeesPresentationFromFinance(
  finance: WbFinance[],
  commission: number
): MarketplaceFeesPresentation {
  let serviceFeesFromOther = 0;
  let accountAdjustments = 0;
  let reimbursements = 0;

  for (const row of finance) {
    const category = effectiveFinanceCategory(row);
    const amount = Math.abs(Number(row.amount));

    if (category === "ADJUSTMENT") {
      accountAdjustments += amount;
      continue;
    }

    if (category === "COMPENSATION") {
      reimbursements += amount;
      continue;
    }

    if (isMarketplaceServiceFeeCategory(category)) {
      serviceFeesFromOther += amount;
      continue;
    }
  }

  const otherTotal = finance.reduce((sum, row) => {
    return profitOperationTypeForRow(row) === "other"
      ? sum + Math.abs(Number(row.amount))
      : sum;
  }, 0);

  return {
    legacyMarketplaceFees: calculateMarketplaceFeesFromParts(commission, otherTotal),
    marketplaceServiceFees: commission + serviceFeesFromOther,
    accountAdjustments,
    reimbursements,
  };
}
