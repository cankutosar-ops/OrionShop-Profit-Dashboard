import { addDecimal, decimal, negateDecimal } from './money';
import type { OzonFinanceModel } from './finance-model';

export type VerifiedOzonProfitInputs = {
  accountId: string; from: string; to: string; currency: 'RUB'; publicationVerified: true;
  productCost: { amount: string; evidence: string };
  tax: { amount: string; evidence: string };
  /** Only independently verified unbilled advertising, never full Performance spend again. */
  advertising: { unbilledAmount: string; evidence: string };
};

/** All Seller-accrued fees/ads are already in the signed contribution; deduct each expense once. */
export function calculateOzonNetProfit(model: OzonFinanceModel, evidence: VerifiedOzonProfitInputs | null) {
  if (!evidence || !model.sourceControlsMatched || model.status !== 'SOURCE_RECONCILED' ||
      model.accountId !== evidence.accountId || model.from !== evidence.from || model.to !== evidence.to ||
      evidence.currency !== 'RUB' || evidence.publicationVerified !== true || model.totals.length !== 1 || model.totals[0].currency !== 'RUB') {
    return { netProfit: null, status: 'UNVERIFIED' as const };
  }
  try {
    if (!evidence.productCost.evidence.trim()) throw new Error();
    decimal(evidence.productCost.amount); // Verified return-cost reversals can be negative.
    if (!evidence.tax.evidence.trim() || decimal(evidence.tax.amount).startsWith('-')) throw new Error();
    if (!evidence.advertising.evidence.trim() || decimal(evidence.advertising.unbilledAmount).startsWith('-')) throw new Error();
    const netProfit = addDecimal(model.totals[0].sourcePnlContribution, negateDecimal(evidence.productCost.amount),
      negateDecimal(evidence.tax.amount), negateDecimal(evidence.advertising.unbilledAmount));
    return { netProfit, status: 'VERIFIED' as const };
  } catch { return { netProfit: null, status: 'UNVERIFIED' as const }; }
}
