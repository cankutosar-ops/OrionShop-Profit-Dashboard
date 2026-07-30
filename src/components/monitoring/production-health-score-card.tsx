import { Activity, AlertTriangle, CheckCircle2, Shield } from "lucide-react";
import type { ProductionHealthReport } from "@/lib/production-health/types";
import { HealthBadge, healthTone } from "@/components/monitoring/health-badge";
import { cn } from "@/lib/utils";

export function ProductionHealthScoreCard({ report }: { report: ProductionHealthReport }) {
  const label = report.score.label;
  const icon =
    label === "Healthy" ? CheckCircle2 : label === "Needs Attention" ? AlertTriangle : Shield;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Production Health
          </p>
          <p className={cn("mt-2 text-4xl font-semibold tabular-nums", healthTone(label))}>
            {report.score.value}%
          </p>
          <p className={cn("mt-1 text-sm font-medium", healthTone(label))}>{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <HealthBadge status={label} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        As of {report.expectedAsOf} · generated {new Date(report.generatedAt).toLocaleString()}
        {report.lastAccountSyncAt
          ? ` · last account sync ${new Date(report.lastAccountSyncAt).toLocaleString()} (${report.lastAccountSyncStatus ?? "—"})`
          : ""}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        {icon === CheckCircle2 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        ) : icon === AlertTriangle ? (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
        ) : (
          <Shield className="h-3.5 w-3.5 text-danger" />
        )}
        Score from schema, freshness, sync status, and operational alerts (diagnostics only).
      </div>
    </div>
  );
}
