import type { FinanceOperationType, WbFinance } from "@/types/database";

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

const SUFFIX_TO_CATEGORY: Record<string, FinanceCategory> = {
  commission: "COMMISSION",
  acquiring_fee: "ACQUIRING",
  ppvz_reward: "PPVZ_REWARD",
  ppvz_vw: "PPVZ_VW",
  logistics: "LOGISTICS",
  oper_logistics: "LOGISTICS",
  return_logistics: "RETURN_LOGISTICS",
  oper_return_logistics: "RETURN_LOGISTICS",
  storage: "STORAGE",
  oper_storage: "STORAGE",
  penalty: "PENALTY",
  oper_penalty: "PENALTY",
  deduction: "ADJUSTMENT",
  additional_payment: "COMPENSATION",
  acceptance: "OTHER",
};

const OPERATION_TYPE_TO_CATEGORY: Record<FinanceOperationType, FinanceCategory> = {
  commission: "COMMISSION",
  logistics: "LOGISTICS",
  return_logistics: "RETURN_LOGISTICS",
  storage: "STORAGE",
  penalty: "PENALTY",
  other: "OTHER",
};

export function parseWbSourceSuffix(
  sourceKey: string | null | undefined,
  wbSourceSuffix?: string | null
): string {
  if (wbSourceSuffix?.trim()) return wbSourceSuffix.trim();
  if (!sourceKey) return "";
  const parts = sourceKey.split(":");
  return parts[parts.length - 1] ?? "";
}

function refineCategoryFromOperName(
  category: FinanceCategory,
  supplierOperName?: string | null
): FinanceCategory {
  if (!supplierOperName?.trim()) return category;
  if (/удерж/i.test(supplierOperName)) return "ADJUSTMENT";
  if (/возмещ/i.test(supplierOperName)) return "COMPENSATION";
  return category;
}

/**
 * Resolve a normalized category from WB sync metadata.
 * Sync and backfill only — not for read-time reclassification in reports.
 */
export function resolveFinanceCategory(input: {
  wbFieldSuffix: string;
  supplierOperName?: string | null;
}): FinanceCategory {
  const base = SUFFIX_TO_CATEGORY[input.wbFieldSuffix] ?? "OTHER";
  return refineCategoryFromOperName(base, input.supplierOperName);
}

/** Maps a normalized category to the permanent high-level operation_type bucket. */
export function categoryToOperationType(category: FinanceCategory): FinanceOperationType {
  switch (category) {
    case "COMMISSION":
      return "commission";
    case "LOGISTICS":
      return "logistics";
    case "RETURN_LOGISTICS":
      return "return_logistics";
    case "STORAGE":
      return "storage";
    case "PENALTY":
      return "penalty";
    case "ACQUIRING":
    case "PPVZ_REWARD":
    case "PPVZ_VW":
    case "ADJUSTMENT":
    case "COMPENSATION":
    case "OTHER":
      return "other";
  }
}

export function isMarketplaceServiceFeeCategory(category: FinanceCategory): boolean {
  return category === "ACQUIRING" || category === "PPVZ_REWARD" || category === "PPVZ_VW";
}

/** Sprint 6.10 legacy rows may store supplier_oper_name in description. */
export function legacyDescriptionAsOperName(description: string | null | undefined): string | null {
  if (!description?.trim() || description.startsWith("rrd:")) return null;
  return description.trim();
}

export function resolveSupplierOperName(row: {
  supplier_oper_name?: string | null;
  description?: string | null;
}): string | null {
  return row.supplier_oper_name?.trim() || legacyDescriptionAsOperName(row.description);
}

/** Infer category for rows missing finance_category (backfill / transitional reads). */
export function inferCategoryFromLegacy(row: {
  operation_type: FinanceOperationType;
  source_key?: string | null;
  wb_source_suffix?: string | null;
  supplier_oper_name?: string | null;
  finance_category?: FinanceCategory | null;
  description?: string | null;
}): FinanceCategory {
  if (row.finance_category) return row.finance_category;

  const suffix = parseWbSourceSuffix(row.source_key, row.wb_source_suffix);
  const operName = resolveSupplierOperName(row);

  if (suffix) {
    return resolveFinanceCategory({ wbFieldSuffix: suffix, supplierOperName: operName });
  }

  return OPERATION_TYPE_TO_CATEGORY[row.operation_type];
}

/** Persisted category when present; otherwise legacy inference for transitional rows. */
export function effectiveFinanceCategory(row: WbFinance): FinanceCategory {
  return inferCategoryFromLegacy(row);
}

/**
 * Profit bucket type for a row.
 * Uses persisted finance_category when set; otherwise legacy operation_type (pre-backfill parity).
 */
export function profitOperationTypeForRow(row: WbFinance): FinanceOperationType {
  if (row.finance_category) {
    return categoryToOperationType(row.finance_category);
  }
  return row.operation_type;
}

export function rowMatchesFinanceCategory(
  row: WbFinance,
  ...categories: FinanceCategory[]
): boolean {
  return categories.includes(effectiveFinanceCategory(row));
}
