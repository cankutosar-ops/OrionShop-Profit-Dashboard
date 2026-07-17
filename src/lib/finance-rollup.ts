import {
  effectiveFinanceCategory,
  isMarketplaceFeeCategory,
  parseWbSourceSuffix,
  profitOperationTypeForRow,
  type FinanceCategory,
} from "@/lib/finance-category";
import type { WbFinance } from "@/types/database";
import type {
  FinanceExpenseTotals,
  FinanceOperationType,
  MarketplaceFeesPresentation,
} from "@/types/finance";
import { FINANCE_OPERATION_TYPES } from "@/types/finance";
export type { MarketplaceFeesPresentation };

export type FinanceCategorySummary = Record<FinanceCategory, number>;

export type ProductMarketplaceFeeParts = {
  marketplaceFees: number;
  accountAdjustments: number;
  reimbursements: number;
};

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
    if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) === "for_pay") {
      continue;
    }
    const category = effectiveFinanceCategory(row);
    summary[category] += Math.abs(Number(row.amount));
  }

  return summary;
}

/**
 * Total Marketplace Fees from category summary.
 * Single source of truth: all marketplace costs except reimbursements.
 */
export function sumMarketplaceFeesFromCategorySummary(summary: FinanceCategorySummary): number {
  return (
    summary.COMMISSION +
    summary.ACQUIRING +
    summary.PPVZ_REWARD +
    summary.PPVZ_VW +
    summary.OTHER
  );
}

/** Total Marketplace Fees from finance rows (shared financial engine). */
export function sumMarketplaceFeesFromFinance(finance: WbFinance[]): number {
  return finance.reduce((sum, row) => {
    if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) === "for_pay") {
      return sum;
    }
    if (isMarketplaceFeeCategory(effectiveFinanceCategory(row))) {
      return sum + Math.abs(Number(row.amount));
    }
    return sum;
  }, 0);
}

/** Per-product marketplace fee parts — account adjustments tracked separately from marketplace fees. */
export function buildProductMarketplaceFeeParts(finance: WbFinance[]): ProductMarketplaceFeeParts {
  let marketplaceFees = 0;
  let accountAdjustments = 0;
  let reimbursements = 0;

  for (const row of finance) {
    const category = effectiveFinanceCategory(row);
    const amount = Math.abs(Number(row.amount));

    if (category === "COMPENSATION") {
      reimbursements += amount;
      continue;
    }
    if (category === "ADJUSTMENT") {
      accountAdjustments += amount;
      continue;
    }
    if (isMarketplaceFeeCategory(category)) {
      marketplaceFees += amount;
    }
  }

  return { marketplaceFees, accountAdjustments, reimbursements };
}

/**
 * Roll effectiveFinanceCategory into permanent operation_type profit buckets.
 * Uses profitOperationTypeForRow — same categorization engine as marketplace fees.
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
    if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) === "for_pay") {
      continue;
    }
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

export function sumFinanceByType(
  financeRecords: WbFinance[],
  type: FinanceOperationType
): number {
  return financeRecords
    .filter((row) => row.operation_type === type)
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

/** Marketplace Fees presentation from persisted categories — single business rule. */
export function buildMarketplaceFeesPresentationFromFinance(
  finance: WbFinance[],
  commission: number
): MarketplaceFeesPresentation {
  const categorySummary = summarizeFinanceByCategory(finance);
  const marketplaceFees = sumMarketplaceFeesFromCategorySummary(categorySummary);

  return {
    marketplaceFees,
    commission: categorySummary.COMMISSION || commission,
    acquiring: categorySummary.ACQUIRING,
    ppvzReward: categorySummary.PPVZ_REWARD,
    ppvzVw: categorySummary.PPVZ_VW,
    otherMarketplaceExpenses: categorySummary.OTHER,
    accountAdjustments: categorySummary.ADJUSTMENT,
    reimbursements: categorySummary.COMPENSATION,
  };
}
