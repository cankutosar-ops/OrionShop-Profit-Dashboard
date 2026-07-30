"use client";

import {
  buildSmartPricingCostBreakdown,
  type CostBreakdownRow,
  type SmartPricingCostBreakdown,
} from "@/lib/smart-pricing-calc-breakdown";
import type { SmartPricingComputedRow } from "@/lib/smart-pricing";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type SmartPricingCostBreakdownDetailProps = {
  row: SmartPricingComputedRow;
  marketingPercent: number;
  taxPercent: number;
};

const SECTION_LABEL: Record<NonNullable<CostBreakdownRow["section"]>, string> = {
  marketplace: "Marketplace Fees",
  logistics: "Logistics",
  other: "Costs & Tax",
};

function formatAmountSafe(amount: number): string {
  return Number.isFinite(amount) ? formatCurrency(amount) : "—";
}

function formatPercentSafe(percent: number | null): string {
  return percent !== null && Number.isFinite(percent) ? formatPercent(percent) : "";
}

function CostBreakdownBody({ data }: { data: SmartPricingCostBreakdown }) {
  const blocks: { section?: CostBreakdownRow["section"]; rows: CostBreakdownRow[] }[] =
    [];

  for (const row of data.rows) {
    const prev = blocks[blocks.length - 1];
    if (!prev || prev.section !== row.section) {
      blocks.push({ section: row.section, rows: [row] });
    } else {
      prev.rows.push(row);
    }
  }

  return (
    <div className="min-w-0 max-w-md">
      <p className="mb-2 truncate text-[11px] font-semibold tracking-wide text-foreground">
        Cost breakdown · {data.title}
      </p>
      <div className="space-y-0">
        {blocks.map((block, blockIndex) => (
          <div key={block.section ?? `block-${blockIndex}`}>
            {block.section ? (
              <p
                className={cn(
                  "mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80",
                  blockIndex > 0 && "mt-2.5 border-t border-border/60 pt-2"
                )}
              >
                {SECTION_LABEL[block.section]}
              </p>
            ) : null}
            {block.rows.map((line) => (
              <div
                key={line.key}
                className="grid grid-cols-[1fr_auto_3.25rem] items-baseline gap-x-3 whitespace-nowrap py-1 text-xs leading-none"
              >
                <span className="truncate text-muted-foreground">{line.label}</span>
                <span className="tabular-nums font-medium text-foreground">
                  {formatAmountSafe(line.amount)}
                </span>
                <span className="text-right tabular-nums text-muted-foreground">
                  {formatPercentSafe(line.percent)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Light gate — no Model B calls. Breakdown mounts only when expanded. */
export function canExpandSmartPricingCostBreakdown(
  row: SmartPricingComputedRow
): boolean {
  if (row.purchaseCost === null) return false;
  const hasAsp =
    row.currentAvgPrice !== null &&
    Number.isFinite(row.currentAvgPrice) &&
    row.currentAvgPrice > 0;
  const hasTarget = row.targetPrice !== null && row.targetPrice > 0;
  return hasAsp || hasTarget;
}

/**
 * Inset Model B cost breakdown — presentation only.
 * Mount only when the parent row is expanded (no hover / floating panel).
 */
export function SmartPricingCostBreakdownDetail({
  row,
  marketingPercent,
  taxPercent,
}: SmartPricingCostBreakdownDetailProps) {
  const data = buildSmartPricingCostBreakdown(row, marketingPercent, taxPercent);
  if (!data) return null;

  return (
    <div
      className="rounded-lg border border-border/60 bg-background/80 px-3 py-2.5"
      role="region"
      aria-label={`Cost breakdown for ${row.supplierArticle}`}
    >
      <CostBreakdownBody data={data} />
    </div>
  );
}
