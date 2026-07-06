"use client";

import { buildSmartPricingExplainContent } from "@/lib/smart-pricing-explain";
import type { SmartPricingComputedRow } from "@/lib/smart-pricing";

type SmartPricingExplainDialogProps = {
  row: SmartPricingComputedRow | null;
  targetMarginPercent: number;
  marketingPercent: number;
  testPrice?: number | null;
  onClose: () => void;
};

export function SmartPricingExplainDialog({
  row,
  targetMarginPercent,
  marketingPercent,
  testPrice,
  onClose,
}: SmartPricingExplainDialogProps) {
  if (!row) return null;

  const content = buildSmartPricingExplainContent(
    row,
    targetMarginPercent,
    marketingPercent,
    testPrice
  );
  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="smart-pricing-explain-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="smart-pricing-explain-title" className="text-sm font-semibold text-foreground">
            {content.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-card-hover hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          {content.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{line.label}</dt>
              <dd className="text-right font-medium tabular-nums text-foreground">{line.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Formula</p>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
            {content.formula}
          </pre>
        </div>

        <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm">
          <span className="font-medium text-muted-foreground">Recommended Price</span>
          <span className="font-semibold tabular-nums text-primary">{content.recommendedPrice}</span>
        </div>

        {content.simulation ? (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Simulation
            </p>
            <dl className="mt-2 space-y-2 text-sm">
              {content.simulation.map((line) => (
                <div key={line.label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{line.label}</dt>
                  <dd className="text-right font-medium tabular-nums text-foreground">
                    {line.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
}
