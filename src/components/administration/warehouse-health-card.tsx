import { AdminMetricCard } from "@/components/administration/admin-metric-card";
import { HealthStateBadge, formatWhen, mapOpsHealthState } from "@/components/administration/warehouse-format";
import { WorkspaceSummaryCard } from "@/components/administration/workspace-summary-card";
import type { WarehouseControlCenterPayload } from "@/lib/administration/warehouse-control-types";

type WarehouseHealthCardProps = {
  data: WarehouseControlCenterPayload;
};

export function WarehouseHealthCard({ data }: WarehouseHealthCardProps) {
  const m = data.monitoring;
  const overall = data.overallState;

  return (
    <div className="space-y-4">
      <WorkspaceSummaryCard
        title="Warehouse Health"
        actions={<HealthStateBadge state={overall} />}
      >
        <p className="text-sm text-muted-foreground">
          {data.health.reason || mapOpsHealthState(data.health.state)}
          {data.account.accountName
            ? ` · ${data.account.accountName} (${data.account.marketplace})`
            : ""}
        </p>
      </WorkspaceSummaryCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AdminMetricCard label="Running Jobs" value={m.runningJobs.length} />
        <AdminMetricCard label="Queued Jobs" value={m.waitingJobs.length} />
        <AdminMetricCard
          label="Failed Jobs"
          value={m.failedJobs.length}
          tone={m.failedJobs.length ? "danger" : "default"}
        />
        <AdminMetricCard
          label="Successful Jobs (recent)"
          value={m.successfulJobsRecent.length}
          hint="Recent successful jobs from ops history"
          tone="success"
        />
        <AdminMetricCard
          label="Last Successful Sync"
          value={formatWhen(m.lastSuccessfulSyncAt)}
        />
        <AdminMetricCard
          label="Last Failed Sync"
          value={formatWhen(m.lastFailedSyncAt)}
          tone={m.lastFailedSyncAt ? "warning" : "default"}
        />
      </div>
    </div>
  );
}
