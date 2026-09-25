import { MARKETPLACE_FEE_ANOMALY_MESSAGE, type MarketplaceFeeStatus } from "@/lib/marketplace-fee-status";

export function MarketplaceFeeStatusNotice({ status }: { status: MarketplaceFeeStatus }) {
  if (status === "ready") return null;
  return (
    <p role="status" className="mb-4 rounded-lg border border-amber-500/40 p-3 text-sm">
      {status === "anomaly"
        ? MARKETPLACE_FEE_ANOMALY_MESSAGE
        : "Marketplace Fees are unavailable because stored Finance fee evidence is not available for this scope."}
    </p>
  );
}
