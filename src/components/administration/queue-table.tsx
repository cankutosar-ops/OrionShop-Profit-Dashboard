"use client";

import { formatWhen } from "@/components/administration/warehouse-format";
import type { WarehouseQueueJob } from "@/lib/warehouse/ops/types";

type QueueTableProps = {
  waiting: WarehouseQueueJob[];
  running: WarehouseQueueJob[];
  retryJobs: WarehouseQueueJob[];
  onCancel: (jobId: string) => Promise<void>;
  busy?: boolean;
};

function JobRows({
  jobs,
  showCancel,
  onCancel,
  busy,
}: {
  jobs: WarehouseQueueJob[];
  showCancel?: boolean;
  onCancel?: (jobId: string) => Promise<void>;
  busy?: boolean;
}) {
  return (
    <>
      {jobs.map((job) => (
        <tr key={job.id} className="border-b border-border/60 last:border-0">
          <td className="px-3 py-2">{job.entities.join(", ") || "—"}</td>
          <td className="px-3 py-2">{job.companyId}</td>
          <td className="px-3 py-2">{job.marketplaceType}</td>
          <td className="px-3 py-2 whitespace-nowrap">{formatWhen(job.createdAt)}</td>
          <td className="px-3 py-2">
            {job.status}
            {job.jobType === "retry" ? " · retry" : ""}
          </td>
          <td className="px-3 py-2">
            {showCancel && onCancel ? (
              <button
                type="button"
                disabled={busy}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                onClick={() => void onCancel(job.id)}
              >
                Cancel
              </button>
            ) : (
              "—"
            )}
          </td>
        </tr>
      ))}
    </>
  );
}

export function QueueTable({
  waiting,
  running,
  retryJobs,
  onCancel,
  busy,
}: QueueTableProps) {
  return (
    <div className="space-y-6">
      {(
        [
          ["Waiting Jobs", waiting, true],
          ["Running Jobs", running, false],
          ["Retry Jobs", retryJobs, true],
        ] as const
      ).map(([title, jobs, cancellable]) => (
        <section key={title}>
          <h3 className="mb-2 text-sm font-semibold">{title}</h3>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Marketplace</th>
                  <th className="px-3 py-2 font-medium">Queue Time</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <JobRows
                  jobs={jobs}
                  showCancel={cancellable}
                  onCancel={onCancel}
                  busy={busy}
                />
                {!jobs.length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                      No jobs
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
