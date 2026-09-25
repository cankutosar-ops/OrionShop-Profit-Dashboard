import {
  effectiveFinanceCategory,
  isInactiveFinanceEvidenceCategory,
  parseWbSourceSuffix,
  profitOperationTypeForRow,
  type FinanceCategory,
} from "@/lib/finance-category";
import {
  calculateMarketplaceFees,
  calculateSalesToSettlementDifference,
  calculateWbRemuneration,
} from "@/lib/marketplace-fees";
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
    PPVZ_VW_NDS: 0,
    LOYALTY_CASHBACK_EXPENSE: 0,
    LOYALTY_CASHBACK_PARTICIPATION: 0,
    FINANCE_SERVICE_FEE: 0,
    ACQUIRING_COFINANCING_REVIEW: 0,
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

/** Total Marketplace Fees from finance rows (shared financial engine). */
export function sumMarketplaceFeesFromFinance(finance: WbFinance[]): number {
  return calculateMarketplaceFees(finance).marketplaceFees;
}

/** Per-product marketplace fee parts — account adjustments tracked separately from marketplace fees. */
export function buildProductMarketplaceFeeParts(finance: WbFinance[]): ProductMarketplaceFeeParts {
  const marketplaceFees = calculateMarketplaceFees(finance).marketplaceFees;
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
    if (isInactiveFinanceEvidenceCategory(effectiveFinanceCategory(row))) {
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
    .filter(
      (row) =>
        row.operation_type === type &&
        !isInactiveFinanceEvidenceCategory(effectiveFinanceCategory(row))
    )
    .reduce((sum, row) => sum + Math.abs(Number(row.amount)), 0);
}

/** Marketplace Fees presentation from persisted categories — single business rule. */
export function buildMarketplaceFeesPresentationFromFinance(
  finance: WbFinance[],
  _legacyCommission: number,
  netSales = 0,
  salesForPay = 0
): MarketplaceFeesPresentation {
  const categorySummary = summarizeFinanceByCategory(finance);
  const fees = calculateMarketplaceFees(finance);
  const remuneration = calculateWbRemuneration(finance, netSales);

  return {
    ...fees,
    wbRemuneration: remuneration.value,
    wbRemunerationPercent: remuneration.percentOfNetSales,
    wbRemunerationStatus: remuneration.status,
    salesToSettlementDifference: calculateSalesToSettlementDifference(netSales, salesForPay),
    accountAdjustments: categorySummary.ADJUSTMENT,
    reimbursements: categorySummary.COMPENSATION,
  };
}
