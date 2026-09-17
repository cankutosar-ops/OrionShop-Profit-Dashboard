import type { NetSalesStatus } from "@/lib/sales-revenue-resolution";

export type MarketplaceFeeStatus = "ready" | "unavailable" | "anomaly";

export const MARKETPLACE_FEE_ANOMALY_MESSAGE =
  "Negative informational Marketplace Fee: returns or an unusual Sales/forPay relationship can make Net Sales lower than Sales API forPay.";

export function resolveMarketplaceFeeStatus(
  salesStatus: NetSalesStatus | undefined,
  marketplaceFee: number
): MarketplaceFeeStatus {
  if (salesStatus !== "ready") return "unavailable";
  return marketplaceFee < 0 ? "anomaly" : "ready";
}

export function combineMarketplaceFeeStatuses(
  statuses: readonly (MarketplaceFeeStatus | undefined)[]
): MarketplaceFeeStatus {
  if (statuses.length === 0 || statuses.some((status) => status === "unavailable" || status === undefined)) {
    return "unavailable";
  }
  return statuses.some((status) => status === "anomaly") ? "anomaly" : "ready";
}
