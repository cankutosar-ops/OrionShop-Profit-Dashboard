import type { WbAd, WbFinance } from "@/types/database";
import { parseWbSourceSuffix } from "@/lib/finance-category";

export type TaxExpenseDecision = "AUTO_YES" | "AUTO_NO" | "REVIEW";
export type TaxExpenseRecognitionStatus = "RECOGNIZED" | "REVIEW" | "UNVERIFIED" | "EXCLUDED";
export type MarketplaceTaxCategory =
  | "COMMISSION" | "ACQUIRING" | "PLATFORM_FEE" | "LOGISTICS"
  | "RETURN_LOGISTICS" | "STORAGE" | "ACCEPTANCE" | "ADVERTISING"
  | "PENALTY" | "ADJUSTMENT" | "COMPENSATION" | "SETTLEMENT" | "OTHER";

/** V4 Product Cost is a profitability input; tax merchandise cost needs paid/sold lot evidence. */
export const PRODUCT_COST_TAX_RULE = {
  category: "PRODUCT_COST" as const,
  decision: "AUTO_NO" as const,
  recognition: "UNVERIFIED" as const,
  rule: "TAX_V1:product_cost_not_a_purchase_tax_lot",
};

export type MarketplaceTaxExpenseLine = {
  accountId: string;
  source: "wb_finance" | "wb_ads";
  sourceKey: string;
  date: string;
  category: MarketplaceTaxCategory;
  decision: TaxExpenseDecision;
  recognitionStatus: TaxExpenseRecognitionStatus;
  signedAmountKopeks: number;
  rule: string;
};

const FINANCE_RULES: Record<string, { category: MarketplaceTaxCategory; decision: TaxExpenseDecision }> = {
  commission: { category: "COMMISSION", decision: "REVIEW" },
  acquiring_fee: { category: "ACQUIRING", decision: "REVIEW" },
  ppvz_reward: { category: "PLATFORM_FEE", decision: "REVIEW" },
  ppvz_vw: { category: "PLATFORM_FEE", decision: "REVIEW" },
  logistics: { category: "LOGISTICS", decision: "REVIEW" },
  oper_logistics: { category: "LOGISTICS", decision: "REVIEW" },
  return_logistics: { category: "RETURN_LOGISTICS", decision: "REVIEW" },
  oper_return_logistics: { category: "RETURN_LOGISTICS", decision: "REVIEW" },
  storage: { category: "STORAGE", decision: "REVIEW" },
  oper_storage: { category: "STORAGE", decision: "REVIEW" },
  acceptance: { category: "ACCEPTANCE", decision: "REVIEW" },
  penalty: { category: "PENALTY", decision: "REVIEW" },
  oper_penalty: { category: "PENALTY", decision: "REVIEW" },
  deduction: { category: "ADJUSTMENT", decision: "REVIEW" },
  additional_payment: { category: "COMPENSATION", decision: "AUTO_NO" },
  for_pay: { category: "SETTLEMENT", decision: "AUTO_NO" },
};

export function classifyFinanceTaxExpense(row: WbFinance): MarketplaceTaxExpenseLine {
  const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
  const configured = FINANCE_RULES[suffix];
  const mapped = configured ?? { category: "OTHER" as const, decision: "REVIEW" as const };
  const amount = Number(row.amount);
  if (!Number.isFinite(amount)) throw new Error("Invalid WB finance amount");
  return {
    accountId: String(row.marketplace_account_id), source: "wb_finance",
    sourceKey: row.source_key ?? `finance:${row.id}`, date: row.operation_date,
    category: mapped.category, decision: mapped.decision,
    recognitionStatus: !row.source_key || !configured ? "UNVERIFIED"
      : mapped.decision === "AUTO_YES" ? "RECOGNIZED"
        : mapped.decision === "AUTO_NO" ? "EXCLUDED" : "REVIEW",
    signedAmountKopeks: Math.round(amount * 100),
    rule: `TAX_WB_V1:${suffix || "unclassified"}`,
  };
}

export function classifyAdTaxExpense(row: WbAd): MarketplaceTaxExpenseLine {
  if (!row.marketplace_account_id) throw new Error("WB ad lacks account scope");
  const spend = Number(row.spend);
  if (!Number.isFinite(spend)) throw new Error("Invalid WB ad spend");
  return {
    accountId: String(row.marketplace_account_id), source: "wb_ads",
    sourceKey: row.source_key ?? `ad:${row.id}`, date: row.campaign_date,
    category: "ADVERTISING", decision: "REVIEW",
    recognitionStatus: row.source_key ? "REVIEW" : "UNVERIFIED",
    signedAmountKopeks: Math.round(spend * 100),
    rule: "TAX_WB_V1:ads_spend_unverified",
  };
}

export type MarketplaceTaxExpenseSummary = {
  totalBusinessKopeks: number;
  deductibleKopeks: number;
  nonDeductibleKopeks: number;
  recognizedKopeks: number;
  reviewKopeks: number;
  unverifiedKopeks: number;
  excludedKopeks: number;
  categories: Array<{ category: MarketplaceTaxCategory; businessKopeks: number;
    recognizedKopeks: number; deductibleKopeks: number; reviewKopeks: number;
    unverifiedKopeks: number; excludedKopeks: number }>;
  lines: MarketplaceTaxExpenseLine[];
  warning: string;
};

export function summarizeMarketplaceTaxExpenses(
  rows: MarketplaceTaxExpenseLine[], allowedAccountIds: readonly string[], from: string, to: string
): MarketplaceTaxExpenseSummary {
  const allowed = new Set(allowedAccountIds);
  const seen = new Set<string>();
  const categories = new Map<MarketplaceTaxCategory, MarketplaceTaxExpenseSummary["categories"][number]>();
  const lines: MarketplaceTaxExpenseLine[] = [];
  let totalBusinessKopeks = 0;
  let deductibleKopeks = 0;
  let nonDeductibleKopeks = 0;
  let reviewKopeks = 0;
  let unverifiedKopeks = 0;
  let excludedKopeks = 0;
  for (const row of rows) {
    if (!allowed.has(row.accountId)) throw new Error("Cross-company marketplace expense fact");
    if (row.date < from || row.date > to) continue;
    const identity = `${row.accountId}:${row.source}:${row.sourceKey}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    lines.push(row);
    // Settlement and compensation are not expenses. Ambiguous deductions are shown for
    // review, but excluded from business total until proven non-overlapping with ads/fees.
    const excludedComponent = row.category === "SETTLEMENT" || row.category === "COMPENSATION";
    const business = row.category === "ADJUSTMENT" ? 0 : row.signedAmountKopeks;
    if (!excludedComponent) totalBusinessKopeks += business;
    const status: TaxExpenseRecognitionStatus = excludedComponent ? "EXCLUDED"
      : row.decision === "AUTO_YES" ? "RECOGNIZED"
        : row.decision === "AUTO_NO" ? "EXCLUDED" : row.recognitionStatus;
    if (status === "RECOGNIZED") deductibleKopeks += business;
    else if (status === "EXCLUDED") {
      nonDeductibleKopeks += row.signedAmountKopeks;
      excludedKopeks += row.signedAmountKopeks;
    } else if (status === "UNVERIFIED") unverifiedKopeks += row.signedAmountKopeks;
    else reviewKopeks += row.signedAmountKopeks;
    const current = categories.get(row.category) ?? {
      category: row.category, businessKopeks: 0, recognizedKopeks: 0,
      deductibleKopeks: 0, reviewKopeks: 0, unverifiedKopeks: 0, excludedKopeks: 0,
    };
    if (!excludedComponent) current.businessKopeks += business;
    if (status === "RECOGNIZED") {
      current.recognizedKopeks += business;
      current.deductibleKopeks += business;
    }
    if (status === "REVIEW") current.reviewKopeks += row.signedAmountKopeks;
    if (status === "UNVERIFIED") current.unverifiedKopeks += row.signedAmountKopeks;
    if (status === "EXCLUDED") current.excludedKopeks += row.signedAmountKopeks;
    categories.set(row.category, current);
  }
  return {
    totalBusinessKopeks, deductibleKopeks, recognizedKopeks: deductibleKopeks,
    nonDeductibleKopeks, reviewKopeks, unverifiedKopeks, excludedKopeks,
    categories: [...categories.values()].sort((a, b) => a.category.localeCompare(b.category)),
    lines,
    warning: "Only component amounts supported by explicit tax evidence are recognized. Review and unverified amounts remain excluded from the tax base; settlements and compensation are classified as excluded rather than expenses.",
  };
}
