"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { copyScopeQueryParams } from "@/lib/filter-params";
import {
  buildDecisionSimulatorFromContext,
  buildLogisticsSliderScenario,
  buildMarketingSliderScenario,
  LOGISTICS_REDUCTION_MAX_PERCENT,
  MARKETING_SLIDER_MAX_PERCENT,
  type DecisionSimulatorContext,
  type DecisionSimulatorReport,
} from "@/lib/decision-simulator";
import {
  DEFAULT_MARKETING_PERCENT,
  DEFAULT_TARGET_MARGIN_PERCENT,
} from "@/lib/smart-pricing-constants";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

type DecisionSimulatorPanelProps = {
  initialContext: DecisionSimulatorContext;
  initialReport: DecisionSimulatorReport;
  availableSkus: string[];
  currentSku: string;
  rangeFrom: string;
  rangeTo: string;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Metric({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card-hover px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">{value}</p>
      {subtitle && <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export function DecisionSimulatorPanel({
  initialContext,
  initialReport,
  availableSkus,
  currentSku,
  rangeFrom,
  rangeTo,
}: DecisionSimulatorPanelProps) {
  const searchParams = useSearchParams();
  const [targetMargin, setTargetMargin] = useState(initialReport.params.targetMarginPercent);
  const [marketing, setMarketing] = useState(initialReport.params.marketingPercent);
  const [logisticsReduction, setLogisticsReduction] = useState(0);
  const [marketingSlider, setMarketingSlider] = useState(initialReport.params.marketingPercent);
  const [sku, setSku] = useState(currentSku);

  const report = useMemo(
    () =>
      buildDecisionSimulatorFromContext(initialContext, {
        targetMarginPercent: targetMargin,
        marketingPercent: marketing,
      }),
    [initialContext, targetMargin, marketing]
  );

  const logisticsScenario = useMemo(
    () =>
      buildLogisticsSliderScenario(
        initialContext,
        { targetMarginPercent: targetMargin, marketingPercent: marketing },
        logisticsReduction
      ),
    [initialContext, targetMargin, marketing, logisticsReduction]
  );

  const marketingScenario = useMemo(
    () =>
      buildMarketingSliderScenario(
        initialContext,
        { targetMarginPercent: targetMargin, marketingPercent: marketing },
        marketingSlider
      ),
    [initialContext, targetMargin, marketing, marketingSlider]
  );

  function navigateSku(nextSku: string) {
    const params = new URLSearchParams();
    copyScopeQueryParams(params, searchParams);
    params.set("sku", nextSku);
    params.set("from", rangeFrom);
    params.set("to", rangeTo);
    params.set("margin", String(targetMargin));
    params.set("marketing", String(marketing));
    window.location.href = `/analytics/simulator?${params.toString()}`;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-[180px] space-y-1">
            <span className="text-xs font-medium text-muted-foreground">SKU</span>
            <select
              value={sku}
              onChange={(e) => {
                setSku(e.target.value);
                navigateSku(e.target.value);
              }}
              className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {availableSkus.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <Section title="Current Situation" description={initialContext.productName}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Current Average Price" value={formatCurrency(initialContext.inputs.currentAvgPrice)} />
          <Metric
            label="Current Operational Margin"
            value={formatPercent(initialContext.inputs.currentOperationalMarginPercent)}
          />
          <Metric
            label="Current Operational Profit"
            value={formatCurrency(initialContext.currentOperationalProfit)}
          />
          <Metric label="Health Score" value={String(initialContext.healthScore)} subtitle="0–100" />
          <Metric label="Status" value={initialContext.healthStatusLabel} />
        </div>
      </Section>

      <Section title="Target" description="Operational margin target — Product Analytics V7 model">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Target Margin %</span>
            <input
              type="number"
              min={1}
              max={80}
              value={targetMargin}
              onChange={(e) =>
                setTargetMargin(Number(e.target.value) || DEFAULT_TARGET_MARGIN_PERCENT)
              }
              className="block w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Marketing %</span>
            <input
              type="number"
              min={0}
              max={50}
              value={marketing}
              onChange={(e) => {
                const next = Number(e.target.value) || 0;
                setMarketing(next);
                setMarketingSlider(Math.min(MARKETING_SLIDER_MAX_PERCENT, next));
              }}
              className="block w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
          </label>
        </div>
      </Section>

      <Section
        title="Recovery Scenarios"
        description="What is the easiest way to make this SKU profitable at the target operational margin?"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card-hover p-4">
            <h4 className="text-sm font-semibold">Scenario A — Increase Price</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Required Selling Price"
                value={
                  report.priceScenario.requiredPrice === null
                    ? "—"
                    : formatCurrency(report.priceScenario.requiredPrice)
                }
              />
              <Metric
                label="Difference"
                value={
                  report.priceScenario.differenceRub === null
                    ? "—"
                    : formatCurrency(report.priceScenario.differenceRub)
                }
              />
              <Metric
                label="Difference %"
                value={
                  report.priceScenario.differencePercent === null
                    ? "—"
                    : formatPercent(report.priceScenario.differencePercent)
                }
              />
              <Metric label="Difficulty" value={report.priceScenario.difficultyLabel} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card-hover p-4">
            <h4 className="text-sm font-semibold">Scenario B — Improve Conversion</h4>
            <p className="mt-1 text-xs text-muted-foreground">{report.conversionScenario.explanation}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Required Conversion"
                value={
                  report.conversionScenario.requiredConversionPercent === null
                    ? "—"
                    : formatPercent(report.conversionScenario.requiredConversionPercent)
                }
                subtitle={
                  report.conversionScenario.conversionIncreasePoints !== null
                    ? `+${report.conversionScenario.conversionIncreasePoints.toFixed(1)} pp vs current ${formatPercent(initialContext.conversionPercent)}`
                    : undefined
                }
              />
              <Metric
                label="Expected Operational Margin"
                value={
                  report.conversionScenario.expectedOperationalMarginPercent === null
                    ? "—"
                    : formatPercent(report.conversionScenario.expectedOperationalMarginPercent)
                }
                subtitle="At current price after conversion shift"
              />
              <Metric
                label="Expected Price"
                value={
                  report.conversionScenario.expectedPrice === null
                    ? "—"
                    : formatCurrency(report.conversionScenario.expectedPrice)
                }
                subtitle="Operational target at required conversion"
              />
              <Metric
                label="Achievable"
                value={report.conversionScenario.achievable ? "Yes" : "No"}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card-hover p-4">
            <h4 className="text-sm font-semibold">Scenario C — Reduce Logistics</h4>
            <label className="mt-2 block text-xs text-muted-foreground">
              Reduce Total Logistics: {logisticsReduction}%
            </label>
            <input
              type="range"
              min={0}
              max={LOGISTICS_REDUCTION_MAX_PERCENT}
              step={1}
              value={logisticsReduction}
              onChange={(e) => setLogisticsReduction(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Metric
                label="Adjusted Logistics / unit"
                value={formatCurrency(logisticsScenario.adjustedUnitLogistics)}
              />
              <Metric
                label="Operational Target Price"
                value={
                  logisticsScenario.operationalTargetPrice === null
                    ? "—"
                    : formatCurrency(logisticsScenario.operationalTargetPrice)
                }
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card-hover p-4">
            <h4 className="text-sm font-semibold">Scenario D — Reduce Marketing</h4>
            <label className="mt-2 block text-xs text-muted-foreground">
              Marketing: {marketingSlider}%
            </label>
            <input
              type="range"
              min={0}
              max={MARKETING_SLIDER_MAX_PERCENT}
              step={1}
              value={marketingSlider}
              onChange={(e) => setMarketingSlider(Number(e.target.value))}
              className="mt-2 w-full"
            />
            <div className="mt-3">
              <Metric
                label="Operational Target Price"
                value={
                  marketingScenario.operationalTargetPrice === null
                    ? "—"
                    : formatCurrency(marketingScenario.operationalTargetPrice)
                }
              />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card-hover p-4">
            <h4 className="text-sm font-semibold">Scenario E — Combined Optimization</h4>
            {report.combinedScenario ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Metric label="Price" value={`+${report.combinedScenario.priceIncreasePercent}%`} />
                <Metric
                  label="Conversion"
                  value={`+${report.combinedScenario.conversionIncreasePercent}%`}
                />
                <Metric
                  label="Logistics"
                  value={`−${report.combinedScenario.logisticsReductionPercent}%`}
                />
                <Metric
                  label="Marketing"
                  value={`${report.combinedScenario.marketingPercent}%`}
                />
                <Metric
                  label="Result"
                  value={formatPercent(report.combinedScenario.resultingMarginPercent)}
                  subtitle={`Target ${targetMargin}% achieved at ${formatCurrency(report.combinedScenario.resultingPrice)}`}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No realistic combined mix found within search bounds.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Sensitivity Analysis" description="Ranked by impact on operational target price (−10% perturbation)">
        <div className="space-y-3">
          {report.sensitivity.items.map((item, index) => (
            <div key={item.key} className="flex items-center gap-3 text-sm">
              <span className="w-4 tabular-nums text-muted-foreground">{index + 1}.</span>
              <span className="w-32 shrink-0 font-medium">{item.label}</span>
              <span className="font-mono text-xs text-primary">
                {"█".repeat(item.barWidth)}
                {"░".repeat(Math.max(0, 10 - item.barWidth))}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {item.impactPercent.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Metric label="Biggest Lever" value={report.sensitivity.biggestLever} />
          <Metric label="Largest Opportunity" value={report.sensitivity.largestOpportunity} />
        </div>
      </Section>

      <Section title="Recovery Recommendation" description="Rule-based · no AI">
        <p className="text-base font-semibold">{report.recommendation.headline}</p>
        <p className="mt-2 text-sm text-muted-foreground">{report.recommendation.detail}</p>
      </Section>

      <Section title="Visual Timeline" description="Required operational price at each margin stage">
        <div className="flex flex-col items-center gap-2 py-2">
          {report.timeline.map((stage, index) => (
            <div key={stage.key} className="flex w-full max-w-md flex-col items-center">
              <div
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-center",
                  stage.key === "current" && "border-border bg-card-hover",
                  stage.key === "break-even" && "border-warning/40 bg-warning/5",
                  stage.key === "target" && "border-primary/40 bg-primary/5",
                  stage.key === "excellent" && "border-success/40 bg-success/5"
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">{stage.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {stage.requiredPrice === null ? "—" : formatCurrency(stage.requiredPrice)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatPercent(stage.marginPercent)} margin
                </p>
              </div>
              {index < report.timeline.length - 1 && (
                <div className="py-1 text-lg text-muted-foreground">↓</div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Validation Reference" description="Key prices for audit">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Current Price" value={formatCurrency(initialContext.inputs.currentAvgPrice)} />
          <Metric
            label="Break-even Price"
            value={report.breakEvenPrice === null ? "—" : formatCurrency(report.breakEvenPrice)}
          />
          <Metric
            label="Operational Target Price"
            value={
              report.operationalTargetPrice === null
                ? "—"
                : formatCurrency(report.operationalTargetPrice)
            }
          />
          <Metric label="Orders / Purchases" value={`${formatNumber(initialContext.orders)} / ${formatNumber(initialContext.purchases)}`} />
        </div>
      </Section>
    </div>
  );
}
