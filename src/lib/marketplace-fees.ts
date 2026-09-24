import type { WbFinance } from "@/types/database";

function sourceSuffix(row: Pick<WbFinance, "source_key" | "wb_source_suffix">): string {
  if (row.wb_source_suffix?.trim()) return row.wb_source_suffix.trim();
  if (!row.source_key) return "";
  return row.source_key.split(":").at(-1) ?? "";
}

/**
 * Canonical WB fee ownership. This list is deliberately suffix-based: broad
 * Finance categories such as OTHER also contain acceptance and other costs.
 */
export const MARKETPLACE_FEE_COMPONENTS = [
  { suffix: "commission", category: "COMMISSION", key: "commission", label: "WB Commission" },
  { suffix: "acquiring_fee", category: "ACQUIRING", key: "acquiring", label: "Acquiring" },
  { suffix: "ppvz_reward", category: "PPVZ_REWARD", key: "ppvzReward", label: "WB Reward / Service" },
  { suffix: "ppvz_vw", category: "PPVZ_VW", key: "ppvzVw", label: "WB Remuneration (base)" },
  { suffix: "vw_nds", category: "PPVZ_VW_NDS", key: "ppvzVwNds", label: "WB Remuneration VAT" },
] as const;

export const MARKETPLACE_FEE_SUFFIXES = new Set<string>(
  MARKETPLACE_FEE_COMPONENTS.map((component) => component.suffix)
);

export type WbRemunerationAvailability =
  | "AVAILABLE"
  | "LEGACY_RAW_UNAVAILABLE"
  | "NO_EVIDENCE";

export type WbRemunerationResult = {
  /** Signed Finance raw_amount: vw + vwNds. */
  value: number | null;
  percentOfNetSales: number | null;
  vw: number | null;
  vwNds: number | null;
  status: WbRemunerationAvailability;
  evidenceRows: number;
  missingRawAmountRows: number;
};

export type MarketplaceFeesResult = {
  marketplaceFees: number;
  commission: number;
  acquiring: number;
  ppvzReward: number;
  ppvzVw: number;
  ppvzVwNds: number;
  attributedMarketplaceFees: number;
  unattributedMarketplaceFees: number;
};

const amountMagnitude = (row: WbFinance): number => Math.abs(Number(row.amount) || 0);

/** Broad WB marketplace fee/service burden from explicitly owned Finance suffixes. */
export function calculateMarketplaceFees(finance: readonly WbFinance[]): MarketplaceFeesResult {
  const result: MarketplaceFeesResult = {
    marketplaceFees: 0,
    commission: 0,
    acquiring: 0,
    ppvzReward: 0,
    ppvzVw: 0,
    ppvzVwNds: 0,
    attributedMarketplaceFees: 0,
    unattributedMarketplaceFees: 0,
  };

  for (const row of finance) {
    const suffix = sourceSuffix(row);
    if (!MARKETPLACE_FEE_SUFFIXES.has(suffix)) continue;
    const amount = amountMagnitude(row);
    result.marketplaceFees += amount;
    if (row.product_id) result.attributedMarketplaceFees += amount;
    else result.unattributedMarketplaceFees += amount;
    if (suffix === "commission") result.commission += amount;
    else if (suffix === "acquiring_fee") result.acquiring += amount;
    else if (suffix === "ppvz_reward") result.ppvzReward += amount;
    else if (suffix === "ppvz_vw") result.ppvzVw += amount;
    else if (suffix === "vw_nds") result.ppvzVwNds += amount;
  }

  return result;
}

/** Narrow signed WB remuneration metric: raw vw + raw vwNds. */
export function calculateWbRemuneration(
  finance: readonly WbFinance[],
  netSales?: number
): WbRemunerationResult {
  let vw = 0;
  let vwNds = 0;
  let evidenceRows = 0;
  let missingRawAmountRows = 0;

  for (const row of finance) {
    const suffix = sourceSuffix(row);
    if (suffix !== "ppvz_vw" && suffix !== "vw_nds") continue;
    evidenceRows += 1;
    if (row.raw_amount == null || !Number.isFinite(Number(row.raw_amount))) {
      missingRawAmountRows += 1;
      continue;
    }
    if (suffix === "ppvz_vw") vw += Number(row.raw_amount);
    else vwNds += Number(row.raw_amount);
  }

  const status: WbRemunerationAvailability =
    evidenceRows === 0
      ? "NO_EVIDENCE"
      : missingRawAmountRows > 0
        ? "LEGACY_RAW_UNAVAILABLE"
        : "AVAILABLE";
  const value = status === "AVAILABLE" ? vw + vwNds : null;
  const denominator = Number(netSales);

  return {
    value,
    percentOfNetSales:
      value != null && Number.isFinite(denominator) && denominator !== 0
        ? (value / denominator) * 100
        : null,
    vw: status === "AVAILABLE" ? vw : null,
    vwNds: status === "AVAILABLE" ? vwNds : null,
    status,
    evidenceRows,
    missingRawAmountRows,
  };
}

/** Reconciliation only. It is not a Finance fee or commission measure. */
export function calculateSalesToSettlementDifference(
  netSales: number,
  salesForPay: number
): number {
  return Number(netSales) - Number(salesForPay);
}
