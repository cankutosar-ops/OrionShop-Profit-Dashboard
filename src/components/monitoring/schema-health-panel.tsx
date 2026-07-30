import type { ProductionHealthReport } from "@/lib/production-health/types";
import { HealthBadge } from "@/components/monitoring/health-badge";

export function SchemaHealthPanel({ report }: { report: ProductionHealthReport }) {
  const schema = report.schema;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Schema Validation</h2>
        <HealthBadge status={schema.status} />
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        {schema.status === "PASS" ? (
          <p className="text-muted-foreground">
            Application schema requirements match the live database.
            {schema.checkedAt ? ` Checked ${new Date(schema.checkedAt).toLocaleString()}.` : ""}
          </p>
        ) : schema.status === "FAIL" ? (
          <div className="space-y-3">
            <p className="text-danger">
              Database schema is incompatible with the running application.
            </p>
            <ul className="space-y-2 text-xs">
              {schema.missing.map((m) => (
                <li key={`${m.table}.${m.column}`} className="rounded-lg border border-border/60 px-3 py-2">
                  <p className="font-medium text-foreground">
                    Missing column: {m.table}.{m.column}
                  </p>
                  <p className="text-muted-foreground">Expected migration: {m.expectedMigration}</p>
                  <p className="text-muted-foreground">Affected table: {m.table}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">Schema probe unavailable (Supabase env not configured).</p>
        )}
      </div>
    </section>
  );
}
