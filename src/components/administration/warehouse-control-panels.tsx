"use client";

import { useState } from "react";
import { AdminSection } from "@/components/administration/admin-section";
import { AlertTable } from "@/components/administration/alert-table";
import { CheckpointTable } from "@/components/administration/checkpoint-table";
import { QueueTable } from "@/components/administration/queue-table";
import { SchedulerTable } from "@/components/administration/scheduler-table";
import { SyncSessionTable } from "@/components/administration/sync-session-table";
import {
  WarehouseAccountToolbar,
  useWarehouseControl,
} from "@/components/administration/warehouse-control-context";
import { WarehouseHealthCard } from "@/components/administration/warehouse-health-card";
import { HealthStateBadge } from "@/components/administration/warehouse-format";
import { WorkspaceSummaryCard } from "@/components/administration/workspace-summary-card";
import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";

function LoadingOrEmpty() {
  const { loading, data, accountId } = useWarehouseControl();
  if (loading) return <p className="text-sm text-muted-foreground">Loading warehouse control…</p>;
  if (!accountId) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a marketplace account in Companies to use the Warehouse Control Center.
      </p>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">No warehouse data.</p>;
  return null;
}

export function WarehouseOverviewPanel() {
  const { data, postAction } = useWarehouseControl();
  const [busy, setBusy] = useState(false);
  const gate = <LoadingOrEmpty />;
  if (gate || !data) {
    return (
      <AdminSection>
        <WarehouseAccountToolbar />
        {gate}
      </AdminSection>
    );
  }

  return (
    <AdminSection
      title="Warehouse Overview"
      description="Operational snapshot from Warehouse ops — no sync engines reinvented here."
    >
      <WarehouseAccountToolbar />
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-[var(--radius-control)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            void postAction({ action: "tick", forceDue: true, processQueue: true }).finally(() =>
              setBusy(false)
            );
          }}
        >
          Run Scheduler Tick
        </button>
      </div>
      <WarehouseHealthCard data={data} />
    </AdminSection>
  );
}

export function WarehouseSessionsPanel() {
  const { data } = useWarehouseControl();
  const gate = <LoadingOrEmpty />;
  return (
    <AdminSection title="Sync Sessions" description="Read-only sync history from Warehouse sessions and ops history.">
      <WarehouseAccountToolbar />
      {gate}
      {data ? (
        <SyncSessionTable sessions={data.sessions} history={data.history} />
      ) : null}
    </AdminSection>
  );
}

export function WarehouseQueuePanel() {
  const { data, postAction } = useWarehouseControl();
  const [busy, setBusy] = useState(false);
  const gate = <LoadingOrEmpty />;
  const retryJobs =
    data?.monitoring.waitingJobs.filter((j) => j.jobType === "retry") ??
    data?.queueStatus.waiting.filter((j) => j.jobType === "retry") ??
    [];

  return (
    <AdminSection title="Queue" description="Waiting, running, and retry jobs from the Warehouse queue.">
      <WarehouseAccountToolbar />
      {gate}
      {data ? (
        <QueueTable
          waiting={data.queueStatus.waiting.filter((j) => j.jobType !== "retry")}
          running={data.queueStatus.running}
          retryJobs={retryJobs}
          busy={busy}
          onCancel={async (jobId) => {
            setBusy(true);
            try {
              await postAction({ action: "cancel", jobId });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </AdminSection>
  );
}

export function WarehouseCheckpointsPanel() {
  const { data } = useWarehouseControl();
  const gate = <LoadingOrEmpty />;
  return (
    <AdminSection title="Checkpoints" description="Durable Warehouse checkpoint state (read-only).">
      <WarehouseAccountToolbar />
      {gate}
      {data ? <CheckpointTable checkpoints={data.checkpoints} /> : null}
    </AdminSection>
  );
}

export function WarehouseSchedulerPanel() {
  const { data, postAction } = useWarehouseControl();
  const [busy, setBusy] = useState(false);
  const gate = <LoadingOrEmpty />;

  return (
    <AdminSection
      title="Scheduler"
      description="Entity schedules from Sprint 10.4 — enable/disable and run now reuse existing ops."
    >
      <WarehouseAccountToolbar />
      {gate}
      {data ? (
        <SchedulerTable
          schedules={data.warehouseStatus.schedules}
          busy={busy}
          onToggle={async (entity, enabled) => {
            setBusy(true);
            try {
              await postAction({ action: "schedule_enable", entity, enabled });
            } finally {
              setBusy(false);
            }
          }}
          onRunNow={async (entity: IncrementalSyncEntity) => {
            setBusy(true);
            try {
              await postAction({
                action: "enqueue",
                entities: [entity],
                processQueue: true,
              });
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </AdminSection>
  );
}

export function WarehouseAlertsPanel() {
  const { data } = useWarehouseControl();
  const gate = <LoadingOrEmpty />;
  return (
    <AdminSection title="Alerts" description="Open Warehouse operational alerts (read-only).">
      <WarehouseAccountToolbar />
      {gate}
      {data ? <AlertTable alerts={data.alerts} /> : null}
    </AdminSection>
  );
}

export function SystemHealthPanel() {
  const { data } = useWarehouseControl();
  const gate = <LoadingOrEmpty />;
  return (
    <AdminSection
      title="System Health"
      description="Subsystem health derived from Warehouse ops, queue, DB reads, and credential presence."
    >
      <WarehouseAccountToolbar />
      {gate}
      {data ? (
        <div className="space-y-4">
          <WorkspaceSummaryCard
            title="Overall"
            actions={<HealthStateBadge state={data.overallState} />}
          >
            <p className="text-sm text-muted-foreground capitalize">{data.overallState}</p>
          </WorkspaceSummaryCard>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.platformHealth.map((part) => (
              <WorkspaceSummaryCard
                key={part.key}
                title={part.label}
                actions={<HealthStateBadge state={part.state} />}
              >
                <p className="text-sm text-muted-foreground">{part.detail}</p>
              </WorkspaceSummaryCard>
            ))}
          </div>
        </div>
      ) : null}
    </AdminSection>
  );
}
