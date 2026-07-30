/**
 * Deterministic lag thresholds for Sprint 9.1 verification.
 * These only affect the verification report — never sync behavior.
 *
 * Finance allows more lag because Wildberries settlement data arrives later
 * than orders/sales.
 */
export const VERIFICATION_LAG_WARN_DAYS = {
  orders: 2,
  sales: 2,
  finance: 7,
  inventory: 2,
} as const;
