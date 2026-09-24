export type FinanceCategory =
  | "COMMISSION"
  | "ACQUIRING"
  | "PPVZ_REWARD"
  | "PPVZ_VW"
  | "PPVZ_VW_NDS"
  | "LOYALTY_CASHBACK_EXPENSE"
  | "LOYALTY_CASHBACK_PARTICIPATION"
  | "FINANCE_SERVICE_FEE"
  | "ACQUIRING_COFINANCING_REVIEW"
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
  "PPVZ_VW_NDS",
  "LOYALTY_CASHBACK_EXPENSE",
  "LOYALTY_CASHBACK_PARTICIPATION",
  "FINANCE_SERVICE_FEE",
  "ACQUIRING_COFINANCING_REVIEW",
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
   * Explicit Finance fee/service components only:
   * commission + acquiring_fee + ppvz_reward + ppvz_vw + vw_nds.
   */
  marketplaceFees: number;
  /** Finance commission suffix; distinct from signed WB Remuneration. */
  commission: number;
  acquiring: number;
  ppvzReward: number;
  ppvzVw: number;
  ppvzVwNds: number;
  wbRemuneration: number | null;
  wbRemunerationPercent: number | null;
  wbRemunerationStatus: import("@/lib/marketplace-fees").WbRemunerationAvailability;
  /** Net Sales − Sales API forPay. Reconciliation only. */
  salesToSettlementDifference: number;
  attributedMarketplaceFees: number;
  unattributedMarketplaceFees: number;
  /** Account-level ADJUSTMENT deductions — separate from Marketplace Fees. */
  accountAdjustments: number;
  /** Excluded from marketplaceFees — not a marketplace cost. */
  reimbursements: number;
};
