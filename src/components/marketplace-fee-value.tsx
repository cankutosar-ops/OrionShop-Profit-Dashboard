import { MARKETPLACE_FEE_ANOMALY_MESSAGE, type MarketplaceFeeStatus } from "@/lib/marketplace-fee-status";

export function MarketplaceFeeValue({ value, status }: { value: string; status?: MarketplaceFeeStatus }) {
  return (
    <span title={status === "anomaly" ? MARKETPLACE_FEE_ANOMALY_MESSAGE : undefined}>
      <span>{value}</span>
      {status === "anomaly" && <span className="block text-xs text-amber-600">Anomaly · signed difference</span>}
      {status === "unavailable" && <span className="block text-xs text-amber-600">Sales incomplete</span>}
    </span>
  );
}
