"use client";

import { formatCurrency } from "@/lib/utils";

type LogisticsBreakdownHintProps = {
  totalLogistics: number;
  purchaseLogistics: number;
  excludedLogistics: number;
  returnLogistics: number;
};

export function LogisticsBreakdownHint({
  totalLogistics,
  purchaseLogistics,
  excludedLogistics,
  returnLogistics,
}: LogisticsBreakdownHintProps) {
  return (
    <span className="group relative inline-block cursor-help border-b border-dotted border-muted-foreground/50">
      {formatCurrency(totalLogistics)}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-52 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs shadow-lg group-hover:block"
      >
        <span className="block font-medium text-foreground">Logistics (in Net Profit)</span>
        <span className="mt-1.5 block space-y-1 text-muted-foreground">
          <span className="flex justify-between gap-2">
            <span>Attributed (eligible)</span>
            <span className="tabular-nums text-foreground">{formatCurrency(totalLogistics)}</span>
          </span>
          <span className="flex justify-between gap-2">
            <span>Purchase-SRID matched</span>
            <span className="tabular-nums">{formatCurrency(purchaseLogistics)}</span>
          </span>
          <span className="flex justify-between gap-2">
            <span>Excluded (not in NP)</span>
            <span className="tabular-nums">{formatCurrency(excludedLogistics)}</span>
          </span>
          <span className="flex justify-between gap-2">
            <span>Return Logistics</span>
            <span className="tabular-nums">{formatCurrency(returnLogistics)}</span>
          </span>
        </span>
      </span>
    </span>
  );
}
