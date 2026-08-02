"use client";

import {
  formatInterval,
  formatWhen,
  nextRunAt,
} from "@/components/administration/warehouse-format";
import type { WarehouseScheduleConfig } from "@/lib/warehouse/ops/types";
import type { IncrementalSyncEntity } from "@/lib/warehouse/incremental/constants";

type SchedulerTableProps = {
  schedules: WarehouseScheduleConfig[];
  onToggle: (entity: IncrementalSyncEntity, enabled: boolean) => Promise<void>;
  onRunNow: (entity: IncrementalSyncEntity) => Promise<void>;
  busy?: boolean;
};

export function SchedulerTable({
  schedules,
  onToggle,
  onRunNow,
  busy,
}: SchedulerTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Entity</th>
            <th className="px-3 py-2 font-medium">Enabled</th>
            <th className="px-3 py-2 font-medium">Interval</th>
            <th className="px-3 py-2 font-medium">Last Run</th>
            <th className="px-3 py-2 font-medium">Next Run</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((row) => (
            <tr key={row.id} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 font-medium">{row.entity}</td>
              <td className="px-3 py-2">{row.enabled ? "Yes" : "No"}</td>
              <td className="px-3 py-2">{formatInterval(row.intervalMs)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatWhen(row.lastEnqueuedAt)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                {row.enabled ? nextRunAt(row.lastEnqueuedAt, row.intervalMs) : "—"}
              </td>
              <td className="px-3 py-2">{row.enabled ? "Active" : "Paused"}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    onClick={() => void onToggle(row.entity, !row.enabled)}
                  >
                    {row.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !row.enabled}
                    className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                    onClick={() => void onRunNow(row.entity)}
                  >
                    Run Now
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!schedules.length ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                No schedules configured.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
