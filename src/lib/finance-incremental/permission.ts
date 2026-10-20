import { createSupabaseFinanceIncrementalStateStore, type FinanceIncrementalStateStore } from "./state";

/** Resume an already verified incremental chain without promoting historical onboarding. */
export async function allowsVerifiedHeadlessFinance(input: {
  accountId: string; headless?: boolean;
  readState?: FinanceIncrementalStateStore["read"];
}): Promise<boolean> {
  if (!input.headless) return false;
  const read = input.readState ?? createSupabaseFinanceIncrementalStateStore().read;
  const state = await read(input.accountId);
  if (String(state.marketplaceAccountId) !== input.accountId) return false;
  return Object.entries(state.completedWeeks).some(([key, period]) => {
    const proof = period.publicationEvidence;
    return key === `${period.from}:${period.to}` && /^\d{4}-\d{2}-\d{2}$/.test(period.from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(period.to) && period.from <= period.to &&
      proof?.source === "wb_sales_reports_list" && proof.marketplaceAccountId === input.accountId &&
      proof.from === period.from && proof.through === period.to &&
      Array.isArray(proof.reportIds) && proof.reportIds.length > 0 &&
      proof.reportIds.every(id => Number.isSafeInteger(id) && id > 0) &&
      Number.isFinite(Date.parse(proof.observedBefore)) && Number.isFinite(Date.parse(period.completedAt)) &&
      Date.parse(proof.observedBefore) <= Date.parse(period.completedAt);
  });
}
