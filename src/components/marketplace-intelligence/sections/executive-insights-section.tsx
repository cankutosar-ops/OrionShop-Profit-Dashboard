"use client";

import type { MarketplaceExecutiveInsightsData } from "@/lib/reporting/sections/marketplace-executive-insights";
import type {
  ExecutiveRecommendation,
  InsightSeverity,
} from "@/lib/reporting/executive-rule-engine";
import type { ReportSection } from "@/lib/reporting/types";
import { ReportSectionFrame } from "@/components/reports/preview/report-section-frame";
import { ReportEmptyState } from "@/components/reports/preview/report-empty-state";
import {
  reportMoney,
  reportNumber,
  reportPercent,
  reportText,
} from "@/components/reports/preview/report-format";
import { cn } from "@/lib/utils";

function severityStyles(severity: InsightSeverity): string {
  switch (severity) {
    case "critical":
      return "border-red-500/35 bg-red-500/5";
    case "warning":
      return "border-amber-500/35 bg-amber-500/5";
    default:
      return "border-sky-500/25 bg-sky-500/5";
  }
}

function severityLabel(severity: InsightSeverity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    default:
      return "Info";
  }
}

function formatAffected(
  metric: ExecutiveRecommendation["affectedMetrics"][number],
  currency: string
): string {
  if (metric.value == null) return "—";
  if (metric.format === "currency" && typeof metric.value === "number") {
    return reportMoney(metric.value, currency);
  }
  if (metric.format === "percent" && typeof metric.value === "number") {
    return reportPercent(metric.value);
  }
  if (metric.format === "number" && typeof metric.value === "number") {
    return reportNumber(metric.value);
  }
  return reportText(String(metric.value));
}

function RecommendationCard({
  rec,
  currency,
}: {
  rec: ExecutiveRecommendation;
  currency: string;
}) {
  return (
    <article
      className={cn(
        "rounded-xl border px-3.5 py-3.5",
        severityStyles(rec.severity)
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            rec.severity === "critical" && "bg-red-500/15 text-red-300",
            rec.severity === "warning" && "bg-amber-500/15 text-amber-200",
            rec.severity === "info" && "bg-sky-500/15 text-sky-200"
          )}
        >
          {severityLabel(rec.severity)}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {rec.category.replace("-", " ")}
        </span>
      </div>

      <h3 className="mt-2 text-sm font-semibold text-foreground">{rec.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{rec.shortDescription}</p>

      <div className="mt-3 space-y-2 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Business explanation
          </p>
          <p className="mt-0.5 leading-relaxed text-foreground">
            {rec.businessExplanation}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recommended action
          </p>
          <p className="mt-0.5 font-medium leading-relaxed text-foreground">
            {rec.recommendedAction}
          </p>
        </div>
      </div>

      {rec.affectedMetrics.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 sm:grid-cols-3">
          {rec.affectedMetrics.map((m) => (
            <div key={`${rec.id}-${m.id}`}>
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {m.label}
              </dt>
              <dd className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">
                {formatAffected(m, currency)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="mt-2 text-[10px] text-muted-foreground">
        Rule {rec.ruleId}
      </p>
    </article>
  );
}

export function ExecutiveInsightsSection({
  section,
  currency,
}: {
  section: ReportSection<MarketplaceExecutiveInsightsData>;
  currency: string;
}) {
  const recommendations = section.data.recommendations ?? [];
  const fired = section.data.firedRuleIds?.length ?? 0;
  const evaluated = section.data.evaluatedRuleIds?.length ?? 0;

  return (
    <ReportSectionFrame
      sectionId="marketplace-executive-insights"
      title="Executive Recommendations"
      description="What to do next — deterministic Rule Engine output for the selected Report Scope. Not AI."
    >
      {evaluated > 0 ? (
        <p className="mb-4 text-xs text-muted-foreground">
          Engine v{section.data.engineVersion} · {fired} of {evaluated} rules
          fired
        </p>
      ) : null}

      {recommendations.length === 0 ? (
        <ReportEmptyState
          variant="no-data"
          label="No recommendations fired"
          hint="No rule thresholds were met for this Report Scope."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              currency={currency}
            />
          ))}
        </div>
      )}
    </ReportSectionFrame>
  );
}
