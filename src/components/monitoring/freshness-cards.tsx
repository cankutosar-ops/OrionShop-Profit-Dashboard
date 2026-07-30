import type { ProductionHealthReport } from "@/lib/production-health/types";
import { HealthBadge } from "@/components/monitoring/health-badge";

export function FreshnessCards({ report }: { report: ProductionHealthReport }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Data Freshness</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {report.freshness.map((row) => (
          <div key={row.entity} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <HealthBadge status={row.status} />
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-wide text-muted-foreground">
              Latest DB date
            </p>
            <p className="text-lg font-semibold tabular-nums text-foreground">
              {row.latestDbDate ?? "—"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Days behind:{" "}
              <span className="tabular-nums text-foreground">
                {row.daysBehind == null ? "—" : row.daysBehind}
              </span>
              {" · "}
              Records: <span className="tabular-nums">{row.recordCount}</span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
