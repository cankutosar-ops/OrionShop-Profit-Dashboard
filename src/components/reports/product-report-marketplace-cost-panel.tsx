"use client";

import { DonutChart } from "@/components/charts/donut-chart";
import { formatChartValue } from "@/components/charts/chart-tooltip";
import { formatKpiCurrency, formatKpiPercent } from "@/lib/kpi-format";
import { buildMarketplaceCostComposition } from "@/lib/reports/product-report-concentration";
import type { ProductReportMarketplaceCostData } from "@/lib/reports/report-engine-types";

type ProductReportMarketplaceCostPanelProps = {
  data: ProductReportMarketplaceCostData;
  currency: string;
};

/**
 * Marketplace Cost Analysis — Wave 3 donut over existing report totals.
 * Zero categories stay visible in the composition list (donut ring omits empty slices).
 */
export function ProductReportMarketplaceCostPanel({
  data,
  currency,
}: ProductReportMarketplaceCostPanelProps) {
  const slices = buildMarketplaceCostComposition(data.totals);
  const compositionTotal = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Marketplace Cost Analysis</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Cost composition from existing Model B product totals
      </p>
      <div className="mt-4">
        <DonutChart
          data={slices}
          centerLabel="Marketplace Cost"
          centerValue={formatChartValue(data.totals.totalMarketplaceCost, "currency", {
            currency,
          })}
          valueFormat="currency"
          height={220}
          legendPlacement="side"
          emptyMessage="No marketplace cost totals for this period"
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slices.map((slice) => {
          const share =
            compositionTotal === 0
              ? 0
              : (slice.value / Math.abs(compositionTotal)) * 100;
          return (
            <li
              key={slice.name}
              className="flex items-baseline justify-between gap-3 border-b border-border/40 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{slice.name}</span>
              <span className="tabular-nums">
                {formatKpiCurrency(slice.value, currency)}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatKpiPercent(share)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
