export type FinanceCategory =
  | "COMMISSION"
  | "ACQUIRING"
  | "PPVZ_REWARD"
  | "PPVZ_VW"
  | "LOGISTICS"
  | "RETURN_LOGISTICS"
  | "STORAGE"
  | "PENALTY"
  | "ADJUSTMENT"
  | "COMPENSATION"
  | "OTHER";

/**
 * Reserved for a future reporting dimension (e.g. expense vs credit).
 * Stored on wb_finance.finance_nature when populated — nullable until then.
 */
export type FinanceNature = string;

export const FINANCE_CATEGORIES: FinanceCategory[] = [
  "COMMISSION",
  "ACQUIRING",
  "PPVZ_REWARD",
  "PPVZ_VW",
  "LOGISTICS",
  "RETURN_LOGISTICS",
  "STORAGE",
  "PENALTY",
  "ADJUSTMENT",
  "COMPENSATION",
  "OTHER",
];

export type FinanceOperationType =
  | "commission"
  | "logistics"
  | "return_logistics"
  | "storage"
  | "penalty"
  | "other";

/** All wb_finance operation types included in net profit. */
export const FINANCE_OPERATION_TYPES: FinanceOperationType[] = [
  "commission",
  "logistics",
  "return_logistics",
  "storage",
  "penalty",
  "other",
];

export type FinanceExpenseTotals = Record<FinanceOperationType, number> & {
  unclassified: number;
  total: number;
};

export type MarketplaceFeesPresentation = {
  /**
   * Per-sale marketplace costs:
   * COMMISSION + ACQUIRING + PPVZ_REWARD + PPVZ_VW + OTHER.
   * Excludes ADJUSTMENT (Account Adjustments) and COMPENSATION (reimbursements).
   */
  marketplaceFees: number;
  /** Commission component — informational breakdown only. */
  commission: number;
  acquiring: number;
  ppvzReward: number;
  ppvzVw: number;
  otherMarketplaceExpenses: number;
  /** Account-level ADJUSTMENT deductions — separate from Marketplace Fees. */
  accountAdjustments: number;
  /** Excluded from marketplaceFees — not a marketplace cost. */
  reimbursements: number;
};
