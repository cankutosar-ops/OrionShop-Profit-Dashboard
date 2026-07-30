import type { ProductionHealthReport } from "@/lib/production-health/types";
import { HealthBadge } from "@/components/monitoring/health-badge";

export function OperationalAlertsPanel({ report }: { report: ProductionHealthReport }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Operational Alerts</h2>
      <div className="rounded-2xl border border-border bg-card p-4">
        {report.alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No operational alerts. Informational monitoring only — nothing auto-repaired.</p>
        ) : (
          <ul className="space-y-3">
            {report.alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-col gap-1 rounded-xl border border-border/60 px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</p>
                </div>
                <HealthBadge status={alert.severity} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
