import {
  Activity,
  Building2,
  Plug,
  Users,
  Warehouse,
  XCircle,
} from "lucide-react";
import { AdminMetricCard } from "@/components/administration/admin-metric-card";
import { AdminSection } from "@/components/administration/admin-section";

export const dynamic = "force-dynamic";

/** Placeholder operational metrics — no live services (Sprint 11.1). */
const PLACEHOLDER_METRICS = [
  {
    label: "Companies",
    value: "—",
    hint: "Placeholder · live inventory in Sprint 11.2",
    tone: "default" as const,
    icon: <Building2 className="h-4 w-4" aria-hidden />,
  },
  {
    label: "Connected Marketplaces",
    value: "—",
    hint: "Placeholder · connections in Sprint 11.2",
    tone: "default" as const,
    icon: <Plug className="h-4 w-4" aria-hidden />,
  },
  {
    label: "Warehouse Health",
    value: "—",
    hint: "Placeholder · warehouse ops UI in Sprint 11.3",
    tone: "default" as const,
    icon: <Warehouse className="h-4 w-4" aria-hidden />,
  },
  {
    label: "Running Jobs",
    value: "0",
    hint: "Placeholder data",
    tone: "default" as const,
    icon: <Activity className="h-4 w-4" aria-hidden />,
  },
  {
    label: "Failed Jobs",
    value: "0",
    hint: "Placeholder data",
    tone: "default" as const,
    icon: <XCircle className="h-4 w-4" aria-hidden />,
  },
  {
    label: "Active Users",
    value: "—",
    hint: "Placeholder · user management in Sprint 11.4",
    tone: "default" as const,
    icon: <Users className="h-4 w-4" aria-hidden />,
  },
];

export default function AdministrationOverviewPage() {
  return (
    <AdminSection
      title="Operational snapshot"
      description="Placeholder cards only — no live Warehouse or tenancy services in this sprint."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PLACEHOLDER_METRICS.map((metric) => (
          <AdminMetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            tone={metric.tone}
            icon={metric.icon}
          />
        ))}
      </div>
    </AdminSection>
  );
}
