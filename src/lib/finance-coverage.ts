import { parseWbSourceSuffix } from "@/lib/finance-category";
import type { WbFinance } from "@/types/database";

export const FINANCE_COVERAGE_GENERATIONS = {
  MODERN_REPORTS_V1: "fully_classified_moving_forward",
  LEGACY_ROWS: "historical_classification_uncertainty",
} as const;

export const FINANCE_COVERAGE_SUFFIXES = [
  "commission",
  "logistics",
  "storage",
  "penalty",
  "return_logistics",
  "deduction",
  "acceptance",
  "acquiring_fee",
  "ppvz_reward",
  "additional_payment",
  "ppvz_vw",
  "vw_nds",
  "installment_cofinancing",
  "cashback_amount",
  "cashback_discount",
  "cashback_commission_change",
  "payment_schedule",
  "for_pay",
  "oper_logistics",
  "oper_return_logistics",
  "oper_storage",
  "oper_penalty",
] as const;

export type FinanceCoverageSuffix = (typeof FINANCE_COVERAGE_SUFFIXES)[number];

export type FinanceRawSum = {
  value: number;
  rows: number;
  missingRawAmountRows: number;
};

export function sumRawFinanceBySuffix(
  finance: readonly WbFinance[],
  suffix: FinanceCoverageSuffix
): FinanceRawSum {
  let value = 0;
  let rows = 0;
  let missingRawAmountRows = 0;

  for (const row of finance) {
    if (parseWbSourceSuffix(row.source_key, row.wb_source_suffix) !== suffix) continue;
    rows += 1;
    if (row.raw_amount == null || !Number.isFinite(Number(row.raw_amount))) {
      missingRawAmountRows += 1;
      continue;
    }
    value += Number(row.raw_amount);
  }

  return { value, rows, missingRawAmountRows };
}

export type FinanceInactiveReadModel = {
  wbRemuneration: {
    vw: FinanceRawSum;
    vwNds: FinanceRawSum;
    includingVat: number;
  };
  cashbackExpense: FinanceRawSum;
  cashbackCompensation: FinanceRawSum;
  cashbackParticipationCost: FinanceRawSum;
  paymentScheduleFee: FinanceRawSum;
  cofinancingEvidence: FinanceRawSum;
};

/** Audit-only model. None of these values are activated in V4 or Smart Pricing. */
export function buildFinanceInactiveReadModel(
  finance: readonly WbFinance[]
): FinanceInactiveReadModel {
  const vw = sumRawFinanceBySuffix(finance, "ppvz_vw");
  const vwNds = sumRawFinanceBySuffix(finance, "vw_nds");
  return {
    wbRemuneration: { vw, vwNds, includingVat: vw.value + vwNds.value },
    cashbackExpense: sumRawFinanceBySuffix(finance, "cashback_amount"),
    cashbackCompensation: sumRawFinanceBySuffix(finance, "cashback_discount"),
    cashbackParticipationCost: sumRawFinanceBySuffix(
      finance,
      "cashback_commission_change"
    ),
    paymentScheduleFee: sumRawFinanceBySuffix(finance, "payment_schedule"),
    cofinancingEvidence: sumRawFinanceBySuffix(finance, "installment_cofinancing"),
  };
}

export type FinanceListControls = Partial<{
  forPaySum: number | null;
  deliveryServiceSum: number | null;
  paidStorageSum: number | null;
  paidAcceptanceSum: number | null;
  deductionSum: number | null;
  penaltySum: number | null;
  additionalPaymentSum: number | null;
  cashbackAmountSum: number | null;
  cashbackDiscountSum: number | null;
  cashbackCommissionChangeSum: number | null;
  paymentSchedule: number | null;
}>;

export type FinanceDetailedCoverageTotals = Partial<
  Record<
    | "vwNds"
    | "installmentCofinancingAmount"
    | "cashbackAmount"
    | "cashbackDiscount"
    | "cashbackCommissionChange"
    | "paymentSchedule",
    number
  >
>;

export type FinanceCoverageIssue = {
  code:
    | "NULL_SOURCE_KEY"
    | "DUPLICATE_SOURCE_KEY"
    | "UNEXPECTED_SUFFIX"
    | "UNMAPPED_NON_ZERO_FIELD"
    | "RECONCILIATION_MISMATCH";
  field: string;
  detail: string;
};

const CONTROL_SUFFIXES: ReadonlyArray<
  readonly [keyof FinanceListControls, FinanceCoverageSuffix]
> = [
  ["forPaySum", "for_pay"],
  ["deliveryServiceSum", "logistics"],
  ["paidStorageSum", "storage"],
  ["paidAcceptanceSum", "acceptance"],
  ["deductionSum", "deduction"],
  ["penaltySum", "penalty"],
  ["additionalPaymentSum", "additional_payment"],
  ["cashbackAmountSum", "cashback_amount"],
  ["cashbackDiscountSum", "cashback_discount"],
  ["cashbackCommissionChangeSum", "cashback_commission_change"],
  ["paymentSchedule", "payment_schedule"],
];

const DETAILED_SUFFIXES: ReadonlyArray<
  readonly [keyof FinanceDetailedCoverageTotals, FinanceCoverageSuffix]
> = [
  ["vwNds", "vw_nds"],
  ["installmentCofinancingAmount", "installment_cofinancing"],
  ["cashbackAmount", "cashback_amount"],
  ["cashbackDiscount", "cashback_discount"],
  ["cashbackCommissionChange", "cashback_commission_change"],
  ["paymentSchedule", "payment_schedule"],
];

export function verifyFinanceCoverage(input: {
  finance: readonly WbFinance[];
  listControls?: FinanceListControls;
  detailedSourceTotals?: FinanceDetailedCoverageTotals;
  tolerance?: number;
}): { ok: boolean; issues: FinanceCoverageIssue[] } {
  const issues: FinanceCoverageIssue[] = [];
  const seen = new Set<string>();
  const expected = new Set<string>(FINANCE_COVERAGE_SUFFIXES);
  const tolerance = input.tolerance ?? 0.01;

  for (const row of input.finance) {
    if (!row.source_key?.trim()) {
      issues.push({
        code: "NULL_SOURCE_KEY",
        field: "source_key",
        detail: `rrd_id=${row.rrd_id ?? "unknown"}`,
      });
      continue;
    }
    if (seen.has(row.source_key)) {
      issues.push({
        code: "DUPLICATE_SOURCE_KEY",
        field: "source_key",
        detail: row.source_key,
      });
    }
    seen.add(row.source_key);
    const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
    if (!expected.has(suffix)) {
      issues.push({ code: "UNEXPECTED_SUFFIX", field: suffix, detail: row.source_key });
    }
  }

  for (const [field, suffix] of CONTROL_SUFFIXES) {
    const control = input.listControls?.[field];
    if (control == null || !Number.isFinite(control)) continue;
    const persisted = sumRawFinanceBySuffix(input.finance, suffix);
    if (control !== 0 && persisted.rows === 0) {
      issues.push({
        code: "UNMAPPED_NON_ZERO_FIELD",
        field,
        detail: `control=${control}; suffix=${suffix}`,
      });
      continue;
    }
    if (persisted.missingRawAmountRows === 0 && Math.abs(control - persisted.value) > tolerance) {
      issues.push({
        code: "RECONCILIATION_MISMATCH",
        field,
        detail: `control=${control}; detailed=${persisted.value}; suffix=${suffix}`,
      });
    }
  }

  for (const [field, suffix] of DETAILED_SUFFIXES) {
    const sourceTotal = input.detailedSourceTotals?.[field];
    if (sourceTotal == null || !Number.isFinite(sourceTotal) || sourceTotal === 0) continue;
    const persisted = sumRawFinanceBySuffix(input.finance, suffix);
    if (persisted.rows === 0) {
      issues.push({
        code: "UNMAPPED_NON_ZERO_FIELD",
        field,
        detail: `source=${sourceTotal}; suffix=${suffix}`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}
