import type { ProductSmartPricingInputs } from "@/lib/smart-pricing-types";
import { formatCurrency, formatPercent } from "@/lib/utils";

/** Compact, keyboard/touch-accessible evidence for the selected cost sample. */
export function SmartPricingCostEvidence({ row }: { row: ProductSmartPricingInputs }) {
  const source = row.resolutionSource === "PRODUCT_HISTORY" ? "SKU"
    : row.resolutionSource === "CATEGORY_HISTORY" ? "Category" : "Account";
  const variance = row.recentSelectedLogisticsVariancePercent;
  return (
    <details className="min-w-36 max-w-60 whitespace-normal text-xs">
      <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {source} {row.costWindowDays ?? 90}d
        <span className="block text-[10px] text-muted-foreground">
          {row.historicalCompletedUnits} sales · {row.costSampleReturnedUnits ?? 0} returns
        </span>
        {row.costWindowDays !== 30 && variance != null && variance > 0 ? (
          <span className="block text-[10px] text-amber-500">30d logistics +{formatPercent(variance)}</span>
        ) : null}
        {row.costEvidenceWarning ? <span className="block text-danger">Coverage warning</span> : null}
      </summary>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <p>Cost period: {row.costWindowFrom ?? "Unknown"} → {row.costAsOfDate ?? "Unknown"}</p>
        <p>Observed logistics: {row.costFirstLogisticsDate ?? "Unknown"} → {row.costLastLogisticsDate ?? "Unknown"}</p>
        <p>Observed dates do not certify complete report coverage. Sales and returns are events within this period, not a matched order cohort.</p>
        <p>Own SKU 30d: {row.recentProductSales ?? 0} sales · {row.recentProductReturns ?? 0} returns · {row.recentProductLogistics == null ? "Unavailable" : formatCurrency(row.recentProductLogistics)} logistics per net unit.</p>
        {row.costEvidenceWarning ? <p className="text-danger">{row.costEvidenceWarning}</p> : null}
      </div>
    </details>
  );
}
